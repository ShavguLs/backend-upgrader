/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlisioService } from './plisio.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

describe('WalletService', () => {
  let service: WalletService;
  let prisma: PrismaService;
  let plisioService: PlisioService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: PrismaService,
          useValue: {
            wallet: {
              findUnique: jest.fn(),
              create: jest.fn(),
              upsert: jest.fn(),
              update: jest.fn(),
            },
            deposit: {
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              findUnique: jest.fn(),
            },
            $transaction: jest.fn((cb) => cb(prisma)),
          },
        },
        {
          provide: PlisioService,
          useValue: {
            createInvoice: jest.fn(),
            verifyHash: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    prisma = module.get<PrismaService>(PrismaService);
    plisioService = module.get<PlisioService>(PlisioService);

    // Default MIN_DEPOSIT_RUB is 100 based on process.env fallback
    (prisma.wallet.upsert as jest.Mock).mockResolvedValue({
      id: 1,
      userId: 1,
      balance: new Prisma.Decimal(0),
    });
    (prisma.deposit.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createDeposit', () => {
    it('should throw BadRequestException if amount is below minimum', async () => {
      await expect(service.createDeposit(1, { amountRub: 50 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create deposit and return invoice url', async () => {
      (prisma.deposit.create as jest.Mock).mockResolvedValue({
        id: 1,
        orderNumber: 'DEP_1',
      });
      (plisioService.createInvoice as jest.Mock).mockResolvedValue({
        txn_id: 'txn123',
        invoice_url: 'http://invoice',
      });
      (prisma.deposit.update as jest.Mock).mockResolvedValue({
        id: 1,
        orderNumber: 'DEP_1',
        invoiceUrl: 'http://invoice',
      });

      const res = await service.createDeposit(1, { amountRub: 150 });
      expect(res.invoiceUrl).toBe('http://invoice');
      expect(prisma.wallet.upsert).toHaveBeenCalledWith({
        where: { userId: 1 },
        update: {},
        create: {
          userId: 1,
          balance: new Prisma.Decimal(0),
          currency: 'RUB',
        },
      });
      expect(prisma.deposit.create).toHaveBeenCalled();
      expect(plisioService.createInvoice).toHaveBeenCalled();
      expect(prisma.deposit.update).toHaveBeenCalled();
    });
  });

  describe('handleCallback', () => {
    it('should throw BadRequestException if hash is invalid', async () => {
      (plisioService.verifyHash as jest.Mock).mockReturnValue(false);
      await expect(
        service.handleCallback({
          verify_hash: 'bad',
          status: 'completed',
          txn_id: '1',
          order_number: '1',
          amount: '1',
          source_amount: '1',
          source_currency: '1',
          currency: '1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if deposit is not found', async () => {
      (plisioService.verifyHash as jest.Mock).mockReturnValue(true);
      (prisma.deposit.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.handleCallback({
          verify_hash: 'ok',
          status: 'completed',
          txn_id: '1',
          order_number: '1',
          amount: '1',
          source_amount: '1',
          source_currency: '1',
          currency: '1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should credit wallet on first completed callback', async () => {
      (plisioService.verifyHash as jest.Mock).mockReturnValue(true);
      (prisma.deposit.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        userId: 1,
        amountRub: new Prisma.Decimal(100),
        status: 'new',
        creditedAt: null,
      });
      (prisma.deposit.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.handleCallback({
        verify_hash: 'ok',
        status: 'completed',
          order_number: 'DEP_1',
          txn_id: '1',
          amount: '100',
          source_amount: '100',
          source_currency: '1',
          currency: '1',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { userId: 1 },
        data: { balance: { increment: new Prisma.Decimal(100) } },
      });
      expect(prisma.deposit.updateMany).toHaveBeenCalledWith({
        where: { id: 1, creditedAt: null },
        data: expect.objectContaining({
          status: 'completed',
          creditedAt: expect.any(Date),
        }),
      });
    });

    it('should not credit wallet when completed callback claim loses', async () => {
      (plisioService.verifyHash as jest.Mock).mockReturnValue(true);
      (prisma.deposit.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        userId: 1,
        orderNumber: 'DEP_1',
        amountRub: new Prisma.Decimal(100),
        status: 'new',
        creditedAt: null,
      });
      (prisma.deposit.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const res = await service.handleCallback({
        verify_hash: 'ok',
        status: 'completed',
        order_number: 'DEP_1',
        txn_id: '1',
        amount: '100',
        source_amount: '100',
        source_currency: '1',
        currency: '1',
      });

      expect(res.message).toBe('Already credited');
      expect(prisma.wallet.update).not.toHaveBeenCalled();
    });

    it('should not credit wallet again on duplicate completed callback', async () => {
      (plisioService.verifyHash as jest.Mock).mockReturnValue(true);
      // Already credited
      (prisma.deposit.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        userId: 1,
        amountRub: new Prisma.Decimal(100),
        status: 'completed',
        creditedAt: new Date(),
      });

      const res = await service.handleCallback({
        verify_hash: 'ok',
        status: 'completed',
          order_number: 'DEP_1',
          txn_id: '1',
          amount: '100',
          source_amount: '100',
          source_currency: '1',
          currency: '1',
        });
      expect(res.message).toBe('Already credited');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should reject completed callbacks with mismatched source amount', async () => {
      (plisioService.verifyHash as jest.Mock).mockReturnValue(true);
      (prisma.deposit.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        userId: 1,
        orderNumber: 'DEP_1',
        amountRub: new Prisma.Decimal(100),
        status: 'new',
        creditedAt: null,
      });

      await expect(
        service.handleCallback({
          verify_hash: 'ok',
          status: 'completed',
          order_number: 'DEP_1',
          txn_id: '1',
          amount: '1',
          source_amount: '50',
          source_currency: 'RUB',
          currency: 'BTC',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should update status but not credit wallet for non-completed callback', async () => {
      (plisioService.verifyHash as jest.Mock).mockReturnValue(true);
      (prisma.deposit.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        userId: 1,
        amountRub: new Prisma.Decimal(100),
        status: 'new',
        creditedAt: null,
      });

      await service.handleCallback({
        verify_hash: 'ok',
        status: 'pending',
        order_number: 'DEP_1',
        txn_id: '1',
        amount: '1',
        source_amount: '1',
        source_currency: '1',
        currency: '1',
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.deposit.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'pending',
        }),
      });
    });
  });
});
