import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WaxpeerWithdrawalProvider } from '../skins/providers/waxpeer-withdrawal.provider';

const POLLABLE_STATUSES = [
  'provider_purchase_pending',
  'trade_sent',
  'needs_review',
];

@Injectable()
export class WithdrawalPollerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(WithdrawalPollerService.name);
  private readonly pollIntervalMs =
    (Number(process.env.WAXPEER_WITHDRAW_POLL_SECONDS) || 60) * 1000;
  private readonly timeoutMs =
    (Number(process.env.WAXPEER_WITHDRAW_TIMEOUT_MINUTES) || 30) * 60 * 1000;
  private readonly recoveryGraceMs =
    (Number(process.env.WAXPEER_RECOVERY_GRACE_SECONDS) || 60) * 1000;

  private timer: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly waxpeerWithdrawal: WaxpeerWithdrawalProvider,
  ) {}

  onApplicationBootstrap() {
    if (!this.waxpeerWithdrawal.isConfigured()) {
      this.logger.warn(
        'WAXPEER_API_KEY not configured; withdrawal poller will not run.',
      );
      return;
    }
    void this.runOnceSafely();
    this.timer = setInterval(() => {
      void this.runOnceSafely();
    }, this.pollIntervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runOnceSafely(): Promise<void> {
    if (this.isPolling) {
      return;
    }
    this.isPolling = true;
    try {
      await this.pollPendingWithdrawals();
    } catch (error) {
      this.logger.error(
        `Withdrawal poll failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    } finally {
      this.isPolling = false;
    }
  }

  async pollPendingWithdrawals(): Promise<void> {
    const pending = await this.prisma.withdrawalRequest.findMany({
      where: { status: { in: POLLABLE_STATUSES } },
      orderBy: { lastCheckedAt: 'asc' },
      take: 50,
    });

    if (pending.length === 0) {
      return;
    }

    const ids = pending.map((w) => w.providerProjectId);
    const statuses = await this.waxpeerWithdrawal.checkProjectIds(ids);
    const byProjectId = new Map(statuses.map((s) => [s.projectId, s]));

    const now = Date.now();
    for (const withdrawal of pending) {
      const status = byProjectId.get(withdrawal.providerProjectId) ?? null;
      const known = byProjectId.has(withdrawal.providerProjectId);
      try {
        await this.applyStatus(withdrawal, status, known, now);
      } catch (error) {
        this.logger.error(
          `Failed to apply withdrawal ${withdrawal.id} status: ${(error as Error).message}`,
        );
      }
    }
  }

  private async applyStatus(
    withdrawal: {
      id: number;
      userId: number;
      inventoryItemId: number;
      status: string;
      providerStatus: number | null;
      providerTradeId?: string | null;
      requestedAt: Date;
      providerProjectId: string;
    },
    status: {
      status: number | null;
      tradeId?: string;
      raw: unknown;
    } | null,
    known: boolean,
    now: number,
  ): Promise<void> {
    const providerStatus = status?.status ?? null;
    const elapsedMs = now - withdrawal.requestedAt.getTime();
    const exceededTimeout = elapsedMs > this.timeoutMs;

    if (providerStatus === 5) {
      await this.completeWithdrawal(withdrawal, status?.raw, status?.tradeId);
      return;
    }
    if (providerStatus === 6) {
      await this.failAndRestore(
        withdrawal,
        'Waxpeer reported declined/refunded',
        status?.raw,
      );
      return;
    }

    const unknownAfterGrace =
      !known &&
      !withdrawal.providerTradeId &&
      elapsedMs > this.recoveryGraceMs;

    let nextStatus = withdrawal.status;
    if (providerStatus === 4) {
      nextStatus = 'trade_sent';
    } else if (providerStatus !== null && [0, 1, 2].includes(providerStatus)) {
      nextStatus = 'provider_purchase_pending';
    }

    if (
      (exceededTimeout || unknownAfterGrace) &&
      nextStatus !== 'needs_review'
    ) {
      nextStatus = 'needs_review';
    }

    const previousStatus = withdrawal.status;
    await this.prisma.withdrawalRequest.update({
      where: { id: withdrawal.id },
      data: {
        status: nextStatus,
        providerStatus: providerStatus ?? undefined,
        providerTradeId: status?.tradeId ?? undefined,
        providerRawData:
          status?.raw !== undefined
            ? (status.raw as Prisma.InputJsonValue)
            : undefined,
        lastCheckedAt: new Date(now),
      },
    });

    if (nextStatus === 'needs_review' && previousStatus !== 'needs_review') {
      await this.prisma.inventoryTransaction.create({
        data: {
          userId: withdrawal.userId,
          inventoryItemId: withdrawal.inventoryItemId,
          type: 'withdraw_needs_review',
          amountRub: new Prisma.Decimal(0),
          metadata: {
            withdrawalId: withdrawal.id,
            providerStatus: providerStatus ?? null,
          },
        },
      });
    } else if (nextStatus === 'trade_sent' && previousStatus !== 'trade_sent') {
      await this.prisma.inventoryTransaction.create({
        data: {
          userId: withdrawal.userId,
          inventoryItemId: withdrawal.inventoryItemId,
          type: 'withdraw_trade_sent',
          amountRub: new Prisma.Decimal(0),
          metadata: {
            withdrawalId: withdrawal.id,
            providerTradeId: status?.tradeId ?? null,
          },
        },
      });
    }
  }

  private async completeWithdrawal(
    withdrawal: { id: number; userId: number; inventoryItemId: number },
    raw: unknown,
    tradeId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.withdrawalRequest.update({
        where: { id: withdrawal.id },
        data: {
          status: 'completed',
          providerStatus: 5,
          providerTradeId: tradeId,
          providerRawData:
            raw !== undefined ? (raw as Prisma.InputJsonValue) : undefined,
          completedAt: new Date(),
          lastCheckedAt: new Date(),
        },
      });
      await tx.inventoryItem.updateMany({
        where: {
          id: withdrawal.inventoryItemId,
          status: { in: ['withdraw_pending'] },
        },
        data: { status: 'withdrawn' },
      });
      await tx.inventoryTransaction.create({
        data: {
          userId: withdrawal.userId,
          inventoryItemId: withdrawal.inventoryItemId,
          type: 'withdraw_complete',
          amountRub: new Prisma.Decimal(0),
          metadata: { withdrawalId: withdrawal.id },
        },
      });
    });
  }

  private async failAndRestore(
    withdrawal: { id: number; userId: number; inventoryItemId: number },
    errorMessage: string,
    raw?: unknown,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.withdrawalRequest.update({
        where: { id: withdrawal.id },
        data: {
          status: 'failed',
          providerStatus: 6,
          errorMessage,
          providerRawData:
            raw !== undefined ? (raw as Prisma.InputJsonValue) : undefined,
          failedAt: new Date(),
          lastCheckedAt: new Date(),
        },
      });
      await tx.inventoryItem.updateMany({
        where: {
          id: withdrawal.inventoryItemId,
          status: 'withdraw_pending',
        },
        data: { status: 'owned' },
      });
      await tx.inventoryTransaction.create({
        data: {
          userId: withdrawal.userId,
          inventoryItemId: withdrawal.inventoryItemId,
          type: 'withdraw_fail',
          amountRub: new Prisma.Decimal(0),
          metadata: { withdrawalId: withdrawal.id, errorMessage },
        },
      });
    });
  }
}
