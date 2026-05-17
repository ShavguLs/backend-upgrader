/* eslint-disable */
import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FxRateService } from '../skins/fx-rate.service';
import { WaxpeerWithdrawalProvider } from '../skins/providers/waxpeer-withdrawal.provider';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: PrismaService;
  let waxpeerWithdrawal: jest.Mocked<WaxpeerWithdrawalProvider>;
  let fxRateService: { getUsdToRubRate: jest.Mock };

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
            user: {
              findUnique: jest.fn(),
            },
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
            withdrawalRequest: {
              create: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
            },
            $transaction: jest.fn((arg) => {
              if (Array.isArray(arg)) {
                return Promise.all(arg);
              }
              return arg(prisma);
            }),
          },
        },
        {
          provide: WaxpeerWithdrawalProvider,
          useValue: {
            isConfigured: jest.fn().mockReturnValue(true),
            findCheapestListing: jest.fn(),
            buyOneP2p: jest.fn(),
            checkProjectIds: jest.fn(),
            checkTradeLink: jest.fn(),
          },
        },
        {
          provide: FxRateService,
          useValue: {
            getUsdToRubRate: jest.fn().mockResolvedValue(90),
          },
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    prisma = module.get<PrismaService>(PrismaService);
    waxpeerWithdrawal = module.get(
      WaxpeerWithdrawalProvider,
    ) as unknown as jest.Mocked<WaxpeerWithdrawalProvider>;
    fxRateService = module.get(FxRateService) as any;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject sellback percentages above 100', () => {
    const originalSellbackPercent = process.env.SKIN_SELLBACK_PERCENT;
    process.env.SKIN_SELLBACK_PERCENT = '101';

    try {
      expect(() => new InventoryService(prisma, waxpeerWithdrawal as any, fxRateService as any)).toThrow(
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
      expect(() => new InventoryService(prisma, waxpeerWithdrawal as any, fxRateService as any)).toThrow(
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

    it('should filter by minPriceRub only', async () => {
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.skin.count as jest.Mock).mockResolvedValue(0);

      await service.getSkins({ minPriceRub: 500 });

      expect(prisma.skin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            priceRub: { gte: new Prisma.Decimal('500') },
          }),
        }),
      );
    });

    it('should filter by maxPriceRub only', async () => {
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.skin.count as jest.Mock).mockResolvedValue(0);

      await service.getSkins({ maxPriceRub: 2000 });

      expect(prisma.skin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            priceRub: { lte: new Prisma.Decimal('2000') },
          }),
        }),
      );
    });

    it('should filter by both minPriceRub and maxPriceRub', async () => {
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([activeSkin]);
      (prisma.skin.count as jest.Mock).mockResolvedValue(1);

      await service.getSkins({ minPriceRub: 500, maxPriceRub: 2000 });

      expect(prisma.skin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            priceRub: {
              gte: new Prisma.Decimal('500'),
              lte: new Prisma.Decimal('2000'),
            },
          }),
        }),
      );
    });

    it('should not include priceRub filter when no price params given', async () => {
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([activeSkin]);
      (prisma.skin.count as jest.Mock).mockResolvedValue(1);

      await service.getSkins({ page: 1, limit: 10 });

      const call = (prisma.skin.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where).not.toHaveProperty('priceRub');
    });

    it('should pass correct skip and take for pagination', async () => {
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.skin.count as jest.Mock).mockResolvedValue(0);

      await service.getSkins({ page: 3, limit: 10 });

      expect(prisma.skin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('should add OR filter for name and marketHashName when search is provided', async () => {
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([activeSkin]);
      (prisma.skin.count as jest.Mock).mockResolvedValue(1);

      await service.getSkins({ search: 'redline' });

      expect(prisma.skin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            OR: [
              { name: { contains: 'redline', mode: 'insensitive' } },
              { marketHashName: { contains: 'redline', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('should not add OR filter when search is an empty string', async () => {
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([activeSkin]);
      (prisma.skin.count as jest.Mock).mockResolvedValue(1);

      await service.getSkins({ search: '' });

      const call = (prisma.skin.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where).not.toHaveProperty('OR');
    });

    it('should not add OR filter when search is whitespace only', async () => {
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([activeSkin]);
      (prisma.skin.count as jest.Mock).mockResolvedValue(1);

      await service.getSkins({ search: '   ' });

      const call = (prisma.skin.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where).not.toHaveProperty('OR');
    });

    it('should trim search before applying it', async () => {
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([activeSkin]);
      (prisma.skin.count as jest.Mock).mockResolvedValue(1);

      await service.getSkins({ search: '  ak-47  ' });

      expect(prisma.skin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'ak-47', mode: 'insensitive' } },
              { marketHashName: { contains: 'ak-47', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('should combine search with min and max price filters', async () => {
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([activeSkin]);
      (prisma.skin.count as jest.Mock).mockResolvedValue(1);

      await service.getSkins({ search: 'ak', minPriceRub: 500, maxPriceRub: 2000 });

      expect(prisma.skin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            OR: [
              { name: { contains: 'ak', mode: 'insensitive' } },
              { marketHashName: { contains: 'ak', mode: 'insensitive' } },
            ],
            priceRub: {
              gte: new Prisma.Decimal('500'),
              lte: new Prisma.Decimal('2000'),
            },
          }),
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

  describe('withdrawInventoryItem', () => {
    const verifiedUser = {
      id: 123,
      steamTradeUrl:
        'https://steamcommunity.com/tradeoffer/new/?partner=900&token=AAAA',
      steamTradePartner: '900',
      steamTradeToken: 'AAAA',
      steamTradeUrlVerifiedAt: new Date(),
    };

    const ownedSkinItem = {
      id: 10,
      userId: 123,
      skinId: 1,
      status: 'owned',
      source: 'purchase',
      purchasePriceRub: new Prisma.Decimal('1000.00'),
      sellPriceRub: new Prisma.Decimal('900.00'),
      metadata: { providerPriceUsdThousandthsAtPurchase: 10000 },
      skin: {
        id: 1,
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        provider: 'waxpeer',
      },
    };

    function defaultListing(price: number = 9500) {
      return {
        itemId: 'listing-1',
        name: ownedSkinItem.skin.marketHashName,
        priceThousandths: price,
        raw: { name: ownedSkinItem.skin.marketHashName, price, item_id: 'listing-1' },
      };
    }

    function setupUserAndItem() {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(verifiedUser);
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(
        ownedSkinItem,
      );
    }

    it('rejects when withdrawal provider is unconfigured', async () => {
      (waxpeerWithdrawal.isConfigured as jest.Mock).mockReturnValue(false);
      await expect(
        service.withdrawInventoryItem(123, { inventoryItemId: 10 }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('rejects when trade URL is missing', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...verifiedUser,
        steamTradeUrl: null,
      });
      await expect(
        service.withdrawInventoryItem(123, { inventoryItemId: 10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when item belongs to a different user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(verifiedUser);
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        ...ownedSkinItem,
        userId: 999,
      });
      await expect(
        service.withdrawInventoryItem(123, { inventoryItemId: 10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when item is not owned', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(verifiedUser);
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        ...ownedSkinItem,
        status: 'sold',
      });
      await expect(
        service.withdrawInventoryItem(123, { inventoryItemId: 10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when skin provider is not waxpeer', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(verifiedUser);
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        ...ownedSkinItem,
        skin: { ...ownedSkinItem.skin, provider: 'other' },
      });
      await expect(
        service.withdrawInventoryItem(123, { inventoryItemId: 10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('restores item and rejects when no listing found', async () => {
      setupUserAndItem();
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.withdrawalRequest.create as jest.Mock).mockResolvedValue({
        id: 7,
        providerProjectId: 'withdrawal_pending_x',
      });
      (prisma.withdrawalRequest.update as jest.Mock).mockResolvedValue({
        id: 7,
        providerProjectId: 'withdrawal_7',
      });
      (waxpeerWithdrawal.findCheapestListing as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.withdrawInventoryItem(123, { inventoryItemId: 10 }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10, status: 'withdraw_pending' },
          data: { status: 'owned' },
        }),
      );
      expect(waxpeerWithdrawal.buyOneP2p).not.toHaveBeenCalled();
    });

    it('restores item when listing price exceeds cap', async () => {
      setupUserAndItem();
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.withdrawalRequest.create as jest.Mock).mockResolvedValue({
        id: 8,
        providerProjectId: 'withdrawal_pending_x',
      });
      (prisma.withdrawalRequest.update as jest.Mock).mockResolvedValue({
        id: 8,
        providerProjectId: 'withdrawal_8',
      });
      (waxpeerWithdrawal.findCheapestListing as jest.Mock).mockResolvedValue(
        defaultListing(20000),
      );

      await expect(
        service.withdrawInventoryItem(123, { inventoryItemId: 10 }),
      ).rejects.toThrow(BadRequestException);

      expect(waxpeerWithdrawal.buyOneP2p).not.toHaveBeenCalled();
      expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10, status: 'withdraw_pending' },
          data: { status: 'owned' },
        }),
      );
    });

    it('calls buy-one-p2p with item id, exact price, partner, token and project id on success', async () => {
      setupUserAndItem();
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.withdrawalRequest.create as jest.Mock).mockResolvedValue({
        id: 9,
        providerProjectId: 'withdrawal_pending_x',
      });
      (prisma.withdrawalRequest.update as jest.Mock).mockResolvedValue({
        id: 9,
        providerProjectId: 'withdrawal_9',
      });
      (waxpeerWithdrawal.findCheapestListing as jest.Mock).mockResolvedValue(
        defaultListing(9500),
      );
      (waxpeerWithdrawal.buyOneP2p as jest.Mock).mockResolvedValue({
        success: true,
        id: 'trade-1',
        duplicateProjectId: false,
        raw: { ok: true },
      });
      (prisma.inventoryItem.findUnique as jest.Mock)
        .mockResolvedValueOnce(ownedSkinItem)
        .mockResolvedValueOnce({ ...ownedSkinItem, status: 'withdraw_pending' });

      const result = await service.withdrawInventoryItem(123, {
        inventoryItemId: 10,
      });

      expect(waxpeerWithdrawal.buyOneP2p).toHaveBeenCalledWith({
        projectId: 'withdrawal_9',
        itemId: 'listing-1',
        priceThousandths: 9500,
        partner: '900',
        token: 'AAAA',
      });
      expect(result.withdrawal.status).toBe('provider_purchase_pending');
    });
  });
});
