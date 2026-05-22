import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlisioService } from './plisio.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { PlisioCallbackPayload } from './plisio-callback.types';
import { Prisma } from '@prisma/client';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly minDepositRub = parseInt(
    process.env.MIN_DEPOSIT_RUB || '100',
    10,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly plisioService: PlisioService,
  ) {}

  private isFreeModeEnabled(): boolean {
    return process.env.FREE_MODE === 'true';
  }

  private getFreeModeStartingBalance(): Prisma.Decimal {
    const raw = process.env.FREE_MODE_STARTING_BALANCE_RUB || '100000';
    let value: Prisma.Decimal;
    try {
      value = new Prisma.Decimal(raw);
    } catch {
      value = new Prisma.Decimal('100000');
    }
    if (!value.isFinite() || value.lte(0)) {
      value = new Prisma.Decimal('100000');
    }
    return value;
  }

  async getWallet(userId: number) {
    let wallet = await this.prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        balance: new Prisma.Decimal(0),
        currency: 'RUB',
      },
    });

    if (this.isFreeModeEnabled() && wallet.freeModeGrantClaimedAt === null) {
      const startingBalance = this.getFreeModeStartingBalance();
      const claim = await this.prisma.wallet.updateMany({
        where: { userId, freeModeGrantClaimedAt: null },
        data: {
          balance: { increment: startingBalance },
          freeModeGrantClaimedAt: new Date(),
        },
      });
      if (claim.count > 0) {
        const refreshed = await this.prisma.wallet.findUnique({
          where: { userId },
        });
        if (refreshed) {
          wallet = refreshed;
        }
      }
    }

    const deposits = await this.prisma.deposit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return { wallet, deposits };
  }

  async createDeposit(userId: number, dto: CreateDepositDto) {
    if (this.isFreeModeEnabled()) {
      throw new BadRequestException('Deposits are disabled in free mode.');
    }

    if (dto.amountRub < this.minDepositRub) {
      throw new BadRequestException(
        `Minimum deposit is ${this.minDepositRub} RUB`,
      );
    }

    // Ensure wallet exists
    await this.getWallet(userId);

    const orderNumber = `DEP_${userId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const deposit = await this.prisma.deposit.create({
      data: {
        userId,
        orderNumber,
        amountRub: new Prisma.Decimal(dto.amountRub),
        sourceCurrency: 'RUB',
        status: 'created',
      },
    });

    const invoice = await this.plisioService.createInvoice({
      amountRub: dto.amountRub,
      orderNumber,
      currency: dto.currency,
    });

    const updatedDeposit = await this.prisma.deposit.update({
      where: { id: deposit.id },
      data: {
        plisioTxnId: invoice.txn_id,
        invoiceUrl: invoice.invoice_url,
      },
    });

    return updatedDeposit;
  }

  async handleCallback(payload: PlisioCallbackPayload) {
    // 1. Verify Hash
    const isValid = this.plisioService.verifyHash(payload);
    if (!isValid) {
      this.logger.error('Invalid Plisio callback hash');
      throw new BadRequestException('Invalid callback hash');
    }

    const orderNumber = payload.order_number;
    if (!orderNumber) {
      this.logger.error('Missing order_number in callback');
      throw new BadRequestException('Missing order_number');
    }

    // 2. Find Deposit
    const deposit = await this.prisma.deposit.findUnique({
      where: { orderNumber },
    });

    if (!deposit) {
      this.logger.error(`Deposit not found for order_number: ${orderNumber}`);
      throw new NotFoundException('Deposit not found');
    }

    // 3. Update Deposit Status & Raw Callback
    const status = payload.status;
    const isCompleted = status === 'completed';

    if (isCompleted) {
      this.assertCallbackAmountMatchesDeposit(payload, deposit);
    }

    // Ignore all later callbacks once a deposit has been credited.
    if (deposit.creditedAt) {
      this.logger.log(
        `Deposit ${orderNumber} already credited. Ignoring callback.`,
      );
      return { success: true, message: 'Already credited' };
    }

    // Start a transaction if we are crediting
    if (isCompleted) {
      const credited = await this.prisma.$transaction(async (prisma) => {
        const claim = await prisma.deposit.updateMany({
          where: { id: deposit.id, creditedAt: null },
          data: {
            status,
            creditedAt: new Date(),
            rawCallback: payload,
          },
        });

        if (claim.count === 0) {
          return false;
        }

        // Update Wallet Balance
        await prisma.wallet.update({
          where: { userId: deposit.userId },
          data: {
            balance: {
              increment: deposit.amountRub,
            },
          },
        });

        return true;
      });

      if (!credited) {
        this.logger.log(
          `Deposit ${orderNumber} already credited. Ignoring duplicate callback.`,
        );
        return { success: true, message: 'Already credited' };
      }

      this.logger.log(
        `Successfully credited deposit ${orderNumber} for user ${deposit.userId}`,
      );
    } else {
      // Only update if the deposit has not been credited yet — a late
      // non-completed callback must never overwrite the "completed" status
      // of an already-credited deposit.
      const result = await this.prisma.deposit.updateMany({
        where: { id: deposit.id, creditedAt: null },
        data: {
          status,
          rawCallback: payload,
        },
      });
      if (result.count === 0) {
        this.logger.log(
          `Deposit ${orderNumber} already credited; ignoring late ${status} callback.`,
        );
      } else {
        this.logger.log(`Updated deposit ${orderNumber} status to ${status}`);
      }
    }

    return { success: true };
  }

  private assertCallbackAmountMatchesDeposit(
    payload: PlisioCallbackPayload,
    deposit: { amountRub: Prisma.Decimal; orderNumber: string },
  ) {
    if (!payload.source_amount) {
      this.logger.error(
        `Missing source_amount for completed deposit ${deposit.orderNumber}`,
      );
      throw new BadRequestException('Missing callback amount');
    }

    let callbackAmount: Prisma.Decimal;
    try {
      callbackAmount = new Prisma.Decimal(payload.source_amount);
    } catch {
      this.logger.error(
        `Invalid source_amount for completed deposit ${deposit.orderNumber}: ${payload.source_amount}`,
      );
      throw new BadRequestException('Invalid callback amount');
    }

    if (!callbackAmount.equals(deposit.amountRub)) {
      this.logger.error(
        `Amount mismatch for deposit ${deposit.orderNumber}: expected ${deposit.amountRub.toString()}, got ${payload.source_amount}`,
      );
      throw new BadRequestException('Amount mismatch');
    }
  }
}
