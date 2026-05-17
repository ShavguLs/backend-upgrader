/* eslint-disable */
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpgraderService } from './upgrader.service';

jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return {
    ...actual,
    randomInt: jest.fn(actual.randomInt),
  };
});

import { randomInt } from 'crypto';

describe('UpgraderService', () => {
  let service: UpgraderService;
  let prisma: PrismaService;

  const ownedItem = {
    id: 10,
    userId: 123,
    skinId: 1,
    purchasePriceRub: new Prisma.Decimal('1000.00'),
    sellPriceRub: new Prisma.Decimal('900.00'),
    status: 'owned',
    source: 'purchase',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const targetSkin = {
    id: 20,
    marketHashName: 'AWP | Asiimov (Field-Tested)',
    name: 'AWP | Asiimov',
    weapon: 'AWP',
    category: 'Sniper Rifle',
    rarity: 'Covert',
    exterior: 'Field-Tested',
    imageUrl: null,
    priceRub: new Prisma.Decimal('1800.00'),
    provider: 'waxpeer',
    providerItemId: 'awp-asiimov-ft',
    lastSyncedAt: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpgraderService,
        {
          provide: PrismaService,
          useValue: {
            inventoryItem: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
            skin: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
            },
            upgradeAttempt: {
              create: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
            },
            inventoryTransaction: {
              create: jest.fn(),
            },
            $transaction: jest.fn(async (arg: any) => {
              if (typeof arg === 'function') {
                return arg(prisma);
              }
              return Promise.all(arg);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<UpgraderService>(UpgraderService);
    prisma = module.get<PrismaService>(PrismaService);
    (randomInt as unknown as jest.Mock).mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('config validation', () => {
    function withEnv(env: Record<string, string | undefined>, fn: () => void) {
      const saved: Record<string, string | undefined> = {};
      for (const key of Object.keys(env)) {
        saved[key] = process.env[key];
        if (env[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = env[key];
        }
      }
      try {
        fn();
      } finally {
        for (const key of Object.keys(saved)) {
          if (saved[key] === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = saved[key];
          }
        }
      }
    }

    it('rejects house edge >= 100', () => {
      withEnv({ UPGRADER_HOUSE_EDGE_PERCENT: '100' }, () => {
        expect(() => new UpgraderService(prisma)).toThrow(
          'UPGRADER_HOUSE_EDGE_PERCENT must be >= 0 and < 100',
        );
      });
    });

    it('rejects negative house edge', () => {
      withEnv({ UPGRADER_HOUSE_EDGE_PERCENT: '-1' }, () => {
        expect(() => new UpgraderService(prisma)).toThrow(
          'UPGRADER_HOUSE_EDGE_PERCENT must be >= 0 and < 100',
        );
      });
    });

    it('rejects min >= max displayed chance', () => {
      withEnv(
        {
          UPGRADER_MIN_DISPLAYED_CHANCE_PERCENT: '80',
          UPGRADER_MAX_DISPLAYED_CHANCE_PERCENT: '75',
        },
        () => {
          expect(() => new UpgraderService(prisma)).toThrow(
            /must be less than UPGRADER_MAX_DISPLAYED_CHANCE_PERCENT/,
          );
        },
      );
    });

    it('rejects negative tolerance', () => {
      withEnv(
        { UPGRADER_TARGET_PRICE_TOLERANCE_PERCENT: '-1' },
        () => {
          expect(() => new UpgraderService(prisma)).toThrow(
            'UPGRADER_TARGET_PRICE_TOLERANCE_PERCENT must be >= 0',
          );
        },
      );
    });
  });

  describe('listOptions', () => {
    it('rejects when source item is missing or not owned', async () => {
      (prisma.inventoryItem.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.listOptions(123, { inventoryItemId: 10, chance: 50 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.skin.findMany).not.toHaveBeenCalled();
    });

    it('uses sellPriceRub to compute target price and returns higher-priced skins around it', async () => {
      (prisma.inventoryItem.findFirst as jest.Mock).mockResolvedValue(ownedItem);
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([
        { ...targetSkin, id: 20, priceRub: new Prisma.Decimal('1800.00') },
        { ...targetSkin, id: 21, priceRub: new Prisma.Decimal('1850.00') },
        { ...targetSkin, id: 22, priceRub: new Prisma.Decimal('1700.00') },
      ]);

      const result = await service.listOptions(123, {
        inventoryItemId: 10,
        chance: 50,
      });

      expect(prisma.inventoryItem.findFirst).toHaveBeenCalledWith({
        where: { id: 10, userId: 123, status: 'owned' },
      });
      // 900 / (50/100) = 1800
      expect(result.targetPriceRub).toBe('1800.00');
      expect(result.sourceValueRub).toBe('900.00');
      expect(result.displayedChancePercent).toBe('50.0000');
      expect(result.items.map((s: any) => s.id)).toEqual([20, 21, 22]);

      const findManyCall = (prisma.skin.findMany as jest.Mock).mock.calls[0][0];
      // 900 / (50/100) = 1800 ideal target; one-sided tolerance only upward.
      expect(findManyCall.where.priceRub.gte).toEqual(
        new Prisma.Decimal('1800.00'),
      );
      expect(findManyCall.where.priceRub).not.toHaveProperty('gt');
      expect(findManyCall.where.isActive).toBe(true);
    });

    it('rejects when displayed chance exceeds configured maximum', async () => {
      const saved = process.env.UPGRADER_MAX_DISPLAYED_CHANCE_PERCENT;
      process.env.UPGRADER_MAX_DISPLAYED_CHANCE_PERCENT = '50';
      try {
        const constrained = new UpgraderService(prisma);
        (prisma.inventoryItem.findFirst as jest.Mock).mockResolvedValue(
          ownedItem,
        );

        await expect(
          constrained.listOptions(123, { inventoryItemId: 10, chance: 75 }),
        ).rejects.toThrow('Upgrade chance is above the allowed maximum');
        expect(prisma.skin.findMany).not.toHaveBeenCalled();
      } finally {
        if (saved === undefined) {
          delete process.env.UPGRADER_MAX_DISPLAYED_CHANCE_PERCENT;
        } else {
          process.env.UPGRADER_MAX_DISPLAYED_CHANCE_PERCENT = saved;
        }
      }
    });

    it('rejects when displayed chance is below configured minimum', async () => {
      const saved = process.env.UPGRADER_MIN_DISPLAYED_CHANCE_PERCENT;
      process.env.UPGRADER_MIN_DISPLAYED_CHANCE_PERCENT = '25';
      try {
        const constrained = new UpgraderService(prisma);
        (prisma.inventoryItem.findFirst as jest.Mock).mockResolvedValue(
          ownedItem,
        );

        await expect(
          constrained.listOptions(123, { inventoryItemId: 10, chance: 10 }),
        ).rejects.toThrow('Upgrade chance is below the allowed minimum');
        expect(prisma.skin.findMany).not.toHaveBeenCalled();
      } finally {
        if (saved === undefined) {
          delete process.env.UPGRADER_MIN_DISPLAYED_CHANCE_PERCENT;
        } else {
          process.env.UPGRADER_MIN_DISPLAYED_CHANCE_PERCENT = saved;
        }
      }
    });

    it('uses correct target price for 25% tier', async () => {
      (prisma.inventoryItem.findFirst as jest.Mock).mockResolvedValue(ownedItem);
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.listOptions(123, {
        inventoryItemId: 10,
        chance: 25,
      });

      // 900 / (25/100) = 3600
      expect(result.targetPriceRub).toBe('3600.00');
    });
  });

  describe('createAttempt', () => {
    function setupForAttempt(opts?: {
      sourceItem?: any;
      targetSkin?: any;
      rollBasisPoints?: number;
      updateManyCount?: number;
    }) {
      const source = opts?.sourceItem ?? ownedItem;
      const target = opts?.targetSkin ?? targetSkin;
      (prisma.inventoryItem.findUnique as jest.Mock)
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce({
          ...source,
          status: opts?.rollBasisPoints && opts.rollBasisPoints <= 450_000
            ? 'upgraded_used'
            : 'upgraded_lost',
          skin: target,
        });
      (prisma.skin.findUnique as jest.Mock).mockResolvedValue(target);
      (prisma.inventoryItem.updateMany as jest.Mock).mockResolvedValue({
        count: opts?.updateManyCount ?? 1,
      });
      (prisma.upgradeAttempt.create as jest.Mock).mockResolvedValue({
        id: 99,
      });
      (prisma.upgradeAttempt.findUnique as jest.Mock).mockResolvedValue({
        id: 99,
        result: 'win',
        createdAt: new Date('2026-05-17T10:00:00Z'),
      });
      (prisma.inventoryItem.create as jest.Mock).mockResolvedValue({
        id: 500,
        userId: 123,
        skinId: target.id,
        purchasePriceRub: target.priceRub,
        sellPriceRub: target.priceRub
          .mul(new Prisma.Decimal('90'))
          .div(100)
          .toDecimalPlaces(2),
        status: 'owned',
        source: 'upgrade',
        skin: target,
      });
      (randomInt as unknown as jest.Mock).mockReturnValue(
        opts?.rollBasisPoints ?? 100_000,
      );
    }

    it('rejects when source item is missing', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createAttempt(123, {
          inventoryItemId: 10,
          targetSkinId: 20,
          chance: 50,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.skin.findUnique).not.toHaveBeenCalled();
    });

    it('rejects when source item belongs to another user', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        ...ownedItem,
        userId: 999,
      });

      await expect(
        service.createAttempt(123, {
          inventoryItemId: 10,
          targetSkinId: 20,
          chance: 50,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when source item is not owned', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        ...ownedItem,
        status: 'sold',
      });

      await expect(
        service.createAttempt(123, {
          inventoryItemId: 10,
          targetSkinId: 20,
          chance: 50,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when target skin is missing or inactive', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(ownedItem);
      (prisma.skin.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createAttempt(123, {
          inventoryItemId: 10,
          targetSkinId: 20,
          chance: 50,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when target price is below the selected chance ideal', async () => {
      // source 900, chance 50 => ideal 1800. Anything < 1800 is rejected.
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(ownedItem);
      (prisma.skin.findUnique as jest.Mock).mockResolvedValue({
        ...targetSkin,
        priceRub: new Prisma.Decimal('1700.00'),
      });

      await expect(
        service.createAttempt(123, {
          inventoryItemId: 10,
          targetSkinId: 20,
          chance: 50,
        }),
      ).rejects.toThrow('too low for the selected chance');
    });

    it('rejects when target price exceeds upper tolerance bound', async () => {
      // source 900, chance 50 => ideal 1800; default tolerance 15% => upper 2070.
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(ownedItem);
      (prisma.skin.findUnique as jest.Mock).mockResolvedValue({
        ...targetSkin,
        priceRub: new Prisma.Decimal('2100.00'),
      });

      await expect(
        service.createAttempt(123, {
          inventoryItemId: 10,
          targetSkinId: 20,
          chance: 50,
        }),
      ).rejects.toThrow('too high for the selected chance');
    });

    it('accepts target priced exactly at the ideal target', async () => {
      // 900 / 0.5 = 1800 — accept.
      setupForAttempt({
        rollBasisPoints: 100_000,
        targetSkin: { ...targetSkin, priceRub: new Prisma.Decimal('1800.00') },
      });

      const response = await service.createAttempt(123, {
        inventoryItemId: 10,
        targetSkinId: 20,
        chance: 50,
      });
      expect(response.result).toBe('win');
    });

    it('marks source upgraded_used and creates won item on win', async () => {
      // displayedChance = 900/1800*100 = 50%, effective = 50 * 0.9 = 45%
      // roll basis points 100_000 => 10.0000% which is <= 45% => win
      setupForAttempt({ rollBasisPoints: 100_000 });

      const response = await service.createAttempt(123, {
        inventoryItemId: 10,
        targetSkinId: 20,
        chance: 50,
      });

      expect(response.result).toBe('win');
      expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({
        where: { id: 10, userId: 123, status: 'owned' },
        data: { status: 'upgraded_used' },
      });
      expect(prisma.inventoryItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            skinId: 20,
            status: 'owned',
            source: 'upgrade',
          }),
        }),
      );
      // win_source + win_target transactions
      expect(
        (prisma.inventoryTransaction.create as jest.Mock).mock.calls.length,
      ).toBe(2);
      expect(prisma.upgradeAttempt.update).toHaveBeenCalledWith({
        where: { id: 99 },
        data: { wonInventoryItemId: 500 },
      });
    });

    it('marks source upgraded_lost and creates no target item on loss', async () => {
      // displayedChance 50%, effective 45%; roll 500_000 => 50% > 45% => loss
      setupForAttempt({ rollBasisPoints: 500_000 });

      const response = await service.createAttempt(123, {
        inventoryItemId: 10,
        targetSkinId: 20,
        chance: 50,
      });

      expect(response.result).toBe('loss');
      expect(response.wonItem).toBeNull();
      expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({
        where: { id: 10, userId: 123, status: 'owned' },
        data: { status: 'upgraded_lost' },
      });
      expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
      expect(
        (prisma.inventoryTransaction.create as jest.Mock).mock.calls.length,
      ).toBe(1);
      expect(
        (prisma.inventoryTransaction.create as jest.Mock).mock.calls[0][0].data
          .type,
      ).toBe('upgrade_loss');
    });

    it('applies hidden house edge to effective chance', async () => {
      setupForAttempt({ rollBasisPoints: 100_000 });

      await service.createAttempt(123, {
        inventoryItemId: 10,
        targetSkinId: 20,
        chance: 50,
      });

      const createCall = (prisma.upgradeAttempt.create as jest.Mock).mock
        .calls[0][0];
      expect(createCall.data.displayedChancePercent.toString()).toBe('50');
      expect(createCall.data.effectiveChancePercent.toString()).toBe('45');
      expect(createCall.data.houseEdgePercent.toString()).toBe('10');
    });

    it('rejects when claim updateMany returns count 0 (double-spend protection)', async () => {
      setupForAttempt({ updateManyCount: 0, rollBasisPoints: 100_000 });

      await expect(
        service.createAttempt(123, {
          inventoryItemId: 10,
          targetSkinId: 20,
          chance: 50,
        }),
      ).rejects.toThrow('Item is not available for upgrade');
      expect(prisma.upgradeAttempt.create).not.toHaveBeenCalled();
      expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
    });

    it('response does not contain effectiveChancePercent or rollPercent', async () => {
      setupForAttempt({ rollBasisPoints: 100_000 });

      const response: any = await service.createAttempt(123, {
        inventoryItemId: 10,
        targetSkinId: 20,
        chance: 50,
      });

      expect(response).not.toHaveProperty('effectiveChancePercent');
      expect(response).not.toHaveProperty('rollPercent');
      expect(response.displayedChancePercent).toBeDefined();
    });
  });
});
