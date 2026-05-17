/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { WaxpeerWithdrawalProvider } from '../skins/providers/waxpeer-withdrawal.provider';
import { WithdrawalPollerService } from './withdrawal-poller.service';

describe('WithdrawalPollerService', () => {
  let service: WithdrawalPollerService;
  let prisma: any;
  let waxpeer: any;

  const baseWithdrawal = {
    id: 1,
    userId: 100,
    inventoryItemId: 10,
    status: 'provider_purchase_pending',
    providerStatus: null,
    providerProjectId: 'withdrawal_1',
    requestedAt: new Date(Date.now() - 60_000),
  };

  beforeEach(async () => {
    prisma = {
      withdrawalRequest: {
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryItem: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryTransaction: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    waxpeer = {
      isConfigured: jest.fn().mockReturnValue(true),
      checkProjectIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawalPollerService,
        { provide: PrismaService, useValue: prisma },
        { provide: WaxpeerWithdrawalProvider, useValue: waxpeer },
      ],
    }).compile();
    service = module.get(WithdrawalPollerService);
  });

  it('marks completed and item withdrawn for status 5', async () => {
    prisma.withdrawalRequest.findMany.mockResolvedValue([baseWithdrawal]);
    waxpeer.checkProjectIds.mockResolvedValue([
      { projectId: 'withdrawal_1', status: 5, tradeId: 't1', raw: {} },
    ]);

    await service.pollPendingWithdrawals();

    expect(prisma.withdrawalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 1 }),
        data: expect.objectContaining({ status: 'completed', providerStatus: 5 }),
      }),
    );
    expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 10 }),
        data: { status: 'withdrawn' },
      }),
    );
  });

  it('restores item and marks failed for status 6', async () => {
    prisma.withdrawalRequest.findMany.mockResolvedValue([baseWithdrawal]);
    waxpeer.checkProjectIds.mockResolvedValue([
      { projectId: 'withdrawal_1', status: 6, raw: {} },
    ]);

    await service.pollPendingWithdrawals();

    expect(prisma.withdrawalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', providerStatus: 6 }),
      }),
    );
    expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 10, status: 'withdraw_pending' }),
        data: { status: 'owned' },
      }),
    );
  });

  it('keeps pending for status 4 (trade sent)', async () => {
    prisma.withdrawalRequest.findMany.mockResolvedValue([baseWithdrawal]);
    waxpeer.checkProjectIds.mockResolvedValue([
      { projectId: 'withdrawal_1', status: 4, raw: {} },
    ]);

    await service.pollPendingWithdrawals();

    expect(prisma.withdrawalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'trade_sent', providerStatus: 4 }),
      }),
    );
    expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it('marks needs_review (and keeps item locked) when provider has no record after grace period', async () => {
    process.env.WAXPEER_RECOVERY_GRACE_SECONDS = '60';
    const old = {
      ...baseWithdrawal,
      providerTradeId: null,
      requestedAt: new Date(Date.now() - 5 * 60 * 1000),
    };
    prisma.withdrawalRequest.findMany.mockResolvedValue([old]);
    waxpeer.checkProjectIds.mockResolvedValue([]);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawalPollerService,
        { provide: PrismaService, useValue: prisma },
        { provide: WaxpeerWithdrawalProvider, useValue: waxpeer },
      ],
    }).compile();
    const freshService = moduleRef.get(WithdrawalPollerService);

    await freshService.pollPendingWithdrawals();

    expect(prisma.withdrawalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'needs_review' }),
      }),
    );
    expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it('keeps pending (no needs_review) when provider has no record but still within grace period', async () => {
    process.env.WAXPEER_RECOVERY_GRACE_SECONDS = '60';
    const fresh = {
      ...baseWithdrawal,
      providerTradeId: null,
      requestedAt: new Date(Date.now() - 10 * 1000),
    };
    prisma.withdrawalRequest.findMany.mockResolvedValue([fresh]);
    waxpeer.checkProjectIds.mockResolvedValue([]);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawalPollerService,
        { provide: PrismaService, useValue: prisma },
        { provide: WaxpeerWithdrawalProvider, useValue: waxpeer },
      ],
    }).compile();
    const freshService = moduleRef.get(WithdrawalPollerService);

    await freshService.pollPendingWithdrawals();

    expect(prisma.withdrawalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ status: 'needs_review' }),
      }),
    );
    expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it('does not promote to needs_review when a trade id was recorded, even after grace', async () => {
    process.env.WAXPEER_RECOVERY_GRACE_SECONDS = '60';
    process.env.WAXPEER_WITHDRAW_TIMEOUT_MINUTES = '30';
    const old = {
      ...baseWithdrawal,
      providerTradeId: 'trade-1',
      requestedAt: new Date(Date.now() - 5 * 60 * 1000),
    };
    prisma.withdrawalRequest.findMany.mockResolvedValue([old]);
    waxpeer.checkProjectIds.mockResolvedValue([]);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawalPollerService,
        { provide: PrismaService, useValue: prisma },
        { provide: WaxpeerWithdrawalProvider, useValue: waxpeer },
      ],
    }).compile();
    const freshService = moduleRef.get(WithdrawalPollerService);

    await freshService.pollPendingWithdrawals();

    expect(prisma.withdrawalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ status: 'needs_review' }),
      }),
    );
    expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it('marks needs_review after timeout exceeded', async () => {
    process.env.WAXPEER_WITHDRAW_TIMEOUT_MINUTES = '30';
    const old = {
      ...baseWithdrawal,
      requestedAt: new Date(Date.now() - 60 * 60 * 1000),
    };
    prisma.withdrawalRequest.findMany.mockResolvedValue([old]);
    waxpeer.checkProjectIds.mockResolvedValue([
      { projectId: 'withdrawal_1', status: 1, raw: {} },
    ]);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        WithdrawalPollerService,
        { provide: PrismaService, useValue: prisma },
        { provide: WaxpeerWithdrawalProvider, useValue: waxpeer },
      ],
    }).compile();
    const freshService = moduleRef.get(WithdrawalPollerService);

    await freshService.pollPendingWithdrawals();

    expect(prisma.withdrawalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'needs_review' }),
      }),
    );
    expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
  });
});
