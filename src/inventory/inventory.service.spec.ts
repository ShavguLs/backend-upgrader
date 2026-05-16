/* eslint-disable */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: PrismaService;

  const activeSkin = {
    id: 1,
    marketHashName: 'AK-47 | Redline (Field-Tested)',
    name: 'AK-47 | Redline',
    priceRub: new Prisma.Decimal('1000.00'),
    isActive: true,
  };

  const wallet = {
    id: 1,
    userId: 123,
    balance: new Prisma.Decimal('1500.00'),
    currency: 'RUB',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: PrismaService,
          useValue: {
            skin: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              count: jest.fn(),
            },
            wallet: {
              upsert: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              findUnique: jest.fn(),
            },
            inventoryItem: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
            inventoryTransaction: {
              create: jest.fn(),
            },
            $transaction: jest.fn((arg) => {
              if (Array.isArray(arg)) {
                return Promise.all(arg);
              }
              return arg(prisma);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject sellback percentages above 100', () => {
    const originalSellbackPercent = process.env.SKIN_SELLBACK_PERCENT;
    process.env.SKIN_SELLBACK_PERCENT = '101';

    try {
      expect(() => new InventoryService(prisma)).toThrow(
        'SKIN_SELLBACK_PERCENT must be between 0 and 100',
      );
    } finally {
      if (originalSellbackPercent === undefined) {
        delete process.env.SKIN_SELLBACK_PERCENT;
      } else {
        process.env.SKIN_SELLBACK_PERCENT = originalSellbackPercent;
      }
    }
  });

  it('should reject negative sellback percentages', () => {
    const originalSellbackPercent = process.env.SKIN_SELLBACK_PERCENT;
    process.env.SKIN_SELLBACK_PERCENT = '-1';

    try {
      expect(() => new InventoryService(prisma)).toThrow(
        'SKIN_SELLBACK_PERCENT must be between 0 and 100',
      );
    } finally {
      if (originalSellbackPercent === undefined) {
        delete process.env.SKIN_SELLBACK_PERCENT;
      } else {
        process.env.SKIN_SELLBACK_PERCENT = originalSellbackPercent;
      }
    }
  });

  describe('getSkins', () => {
    it('should return active skins with pagination', async () => {
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([activeSkin]);
      (prisma.skin.count as jest.Mock).mockResolvedValue(1);

      const result = await service.getSkins({
        search: 'redline',
        page: 1,
        limit: 10,
      });

      expect(result.items).toEqual([activeSkin]);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
      expect(prisma.skin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
          select: expect.not.objectContaining({ providerRawData: true }),
          take: 10,
        }),
      );
    });
  });

  describe('buySkin', () => {
    it('should reject missing skin', async () => {
      (prisma.skin.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.buySkin(123, { skinId: 1 })).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.wallet.update).not.toHaveBeenCalled();
      expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
      expect(prisma.inventoryTransaction.create).not.toHaveBeenCalled();
    });

    it('should reject inactive skin', async () => {
      (prisma.skin.findUnique as jest.Mock).mockResolvedValue({
        ...activeSkin,
        isActive: false,
      });

      await expect(service.buySkin(123, { skinId: 1 })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.wallet.update).not.toHaveBeenCalled();
      expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
      expect(prisma.inventoryTransaction.create).not.toHaveBeenCalled();
    });

    it('should reject insufficient wallet balance', async () => {
      (prisma.skin.findUnique as jest.Mock).mockResolvedValue(activeSkin);
      (prisma.wallet.upsert as jest.Mock).mockResolvedValue(wallet);
      (prisma.wallet.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(service.buySkin(123, { skinId: 1 })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.wallet.updateMany).toHaveBeenCalledWith({
        where: { userId: 123, balance: { gte: activeSkin.priceRub } },
        data: { balance: { decrement: activeSkin.priceRub } },
      });
      expect(prisma.wallet.findUnique).not.toHaveBeenCalled();
      expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
      expect(prisma.inventoryTransaction.create).not.toHaveBeenCalled();
    });

    it('should create owned item and purchase transaction', async () => {
      const createdItem = {
        id: 10,
        userId: 123,
        skinId: 1,
        purchasePriceRub: new Prisma.Decimal('1000.00'),
        sellPriceRub: new Prisma.Decimal('900.00'),
        status: 'owned',
      };
      (prisma.skin.findUnique as jest.Mock).mockResolvedValue(activeSkin);
      (prisma.wallet.upsert as jest.Mock).mockResolvedValue(wallet);
      (prisma.wallet.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        ...wallet,
        balance: new Prisma.Decimal('500.00'),
      });
      (prisma.inventoryItem.create as jest.Mock).mockResolvedValue(createdItem);

      const result = await service.buySkin(123, { skinId: 1 });

      expect(prisma.wallet.updateMany).toHaveBeenCalledWith({
        where: { userId: 123, balance: { gte: activeSkin.priceRub } },
        data: { balance: { decrement: activeSkin.priceRub } },
      });
      expect(prisma.wallet.findUnique).toHaveBeenCalledWith({
        where: { userId: 123 },
      });
      expect(prisma.inventoryItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchasePriceRub: activeSkin.priceRub,
            sellPriceRub: new Prisma.Decimal('900.00'),
            status: 'owned',
          }),
        }),
      );
      expect(prisma.inventoryTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'purchase',
          amountRub: activeSkin.priceRub,
        }),
      });
      expect(result.item).toEqual(createdItem);
      expect(result.wallet.balance.toString()).toBe('500');
    });
  });

  describe('sellInventoryItem', () => {
    it('should reject missing or foreign item', async () => {
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await expect(
        service.sellInventoryItem(123, { inventoryItemId: 10 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.wallet.upsert).not.toHaveBeenCalled();
      expect(prisma.inventoryItem.findUnique).not.toHaveBeenCalled();
      expect(prisma.inventoryTransaction.create).not.toHaveBeenCalled();
    });

    it('should reject item that is not owned', async () => {
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await expect(
        service.sellInventoryItem(123, { inventoryItemId: 10 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.wallet.upsert).not.toHaveBeenCalled();
      expect(prisma.inventoryItem.findUnique).not.toHaveBeenCalled();
      expect(prisma.inventoryTransaction.create).not.toHaveBeenCalled();
    });

    it('should credit stored sell price and mark item sold', async () => {
      const ownedItem = {
        id: 10,
        userId: 123,
        skinId: 1,
        status: 'owned',
        purchasePriceRub: new Prisma.Decimal('1000.00'),
        sellPriceRub: new Prisma.Decimal('900.00'),
        skin: { ...activeSkin, priceRub: new Prisma.Decimal('2000.00') },
      };
      const soldItem = { ...ownedItem, status: 'sold' };
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(
        soldItem,
      );
      (prisma.wallet.upsert as jest.Mock).mockResolvedValue({
        ...wallet,
        balance: new Prisma.Decimal('2400.00'),
      });

      const result = await service.sellInventoryItem(123, {
        inventoryItemId: 10,
      });

      expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({
        where: { id: 10, userId: 123, status: 'owned' },
        data: { status: 'sold' },
      });
      expect(prisma.inventoryItem.findUnique).toHaveBeenCalledWith({
        where: { id: 10 },
        include: {
          skin: {
            select: expect.not.objectContaining({ providerRawData: true }),
          },
        },
      });
      expect(prisma.wallet.upsert).toHaveBeenCalledWith({
        where: { userId: 123 },
        update: { balance: { increment: ownedItem.sellPriceRub } },
        create: {
          userId: 123,
          balance: ownedItem.sellPriceRub,
          currency: 'RUB',
        },
      });
      expect(prisma.inventoryTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'sell',
          amountRub: ownedItem.sellPriceRub,
        }),
      });
      expect(result.item.status).toBe('sold');
    });
  });
});
