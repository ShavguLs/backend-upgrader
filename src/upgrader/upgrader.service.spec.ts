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

const UPGRADER_ENV_DEFAULTS: Record<string, string> = {
  SKIN_SELLBACK_PERCENT: '90',
  SKIN_MIN_PRICE_RUB: '10',
  UPGRADER_HOUSE_EDGE_PERCENT: '10',
  UPGRADER_MIN_DISPLAYED_CHANCE_PERCENT: '1',
  UPGRADER_MAX_DISPLAYED_CHANCE_PERCENT: '75',
};

describe('UpgraderService', () => {
  let service: UpgraderService;
  let prisma: PrismaService;
  const savedUpgraderEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const [key, value] of Object.entries(UPGRADER_ENV_DEFAULTS)) {
      savedUpgraderEnv[key] = process.env[key];
      process.env[key] = value;
    }
  });

  afterAll(() => {
    for (const key of Object.keys(savedUpgraderEnv)) {
      if (savedUpgraderEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedUpgraderEnv[key];
      }
    }
  });

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
    priceRub: new Prisma.Decimal('2000.00'),
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
              findFirst: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
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

    it('rejects SKIN_SELLBACK_PERCENT=0 (division-by-zero guard)', () => {
      withEnv({ SKIN_SELLBACK_PERCENT: '0' }, () => {
        expect(() => new UpgraderService(prisma)).toThrow(
          'SKIN_SELLBACK_PERCENT must be > 0 and <= 100',
        );
      });
    });

    it('rejects SKIN_SELLBACK_PERCENT above 100', () => {
      withEnv({ SKIN_SELLBACK_PERCENT: '101' }, () => {
        expect(() => new UpgraderService(prisma)).toThrow(
          'SKIN_SELLBACK_PERCENT must be > 0 and <= 100',
        );
      });
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

    it('queries a broad chance range from requested tier up to max displayed chance', async () => {
      (prisma.inventoryItem.findFirst as jest.Mock).mockResolvedValue(ownedItem);
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([
        { ...targetSkin, id: 20, priceRub: new Prisma.Decimal('2000.00') },
        { ...targetSkin, id: 21, priceRub: new Prisma.Decimal('1800.00') },
        { ...targetSkin, id: 22, priceRub: new Prisma.Decimal('1500.00') },
      ]);

      const result: any = await service.listOptions(123, {
        inventoryItemId: 10,
        chance: 50,
      });

      expect(prisma.inventoryItem.findFirst).toHaveBeenCalledWith({
        where: { id: 10, userId: 123, status: 'owned' },
      });
      // ideal received = 900 / (50/100) = 1800
      expect(result.targetValueRub).toBe('1800.00');
      expect(result).not.toHaveProperty('targetPriceRub');
      expect(result.sourceValueRub).toBe('900.00');
      expect(result.displayedChancePercent).toBe('50.0000');
      expect(result.requestedChancePercent).toBe('50.0000');
      // Sorted by actual chance ascending:
      // 2000 -> received 1800 -> chance 50.0000
      // 1800 -> received 1620 -> chance 55.5556
      // 1500 -> received 1350 -> chance 66.6667
      expect(result.items.map((s: any) => s.id)).toEqual([20, 21, 22]);
      expect(result.items[0].receivedValueRub).toBe('1800.00');
      expect(result.items[1].receivedValueRub).toBe('1620.00');
      expect(result.items[2].receivedValueRub).toBe('1350.00');
      expect(result.items[0].displayedChancePercent).toBe('50.0000');
      expect(result.items[1].displayedChancePercent).toBe('55.5556');
      expect(result.items[2].displayedChancePercent).toBe('66.6667');

      // Broad range: requested 50% is lower anchor, max 75% is upper anchor.
      // lowerReceived = 900 / 0.75 = 1200.00; rawLower = 1200 / 0.9 = 1333.33
      // upperReceived = 900 / 0.50 = 1800.00; rawUpper = 1800 / 0.9 = 2000.00
      const calls = (prisma.skin.findMany as jest.Mock).mock.calls;
      expect(calls).toHaveLength(1);
      const call = calls[0][0];
      expect(call.where.priceRub.gte).toEqual(new Prisma.Decimal('1333.33'));
      expect(call.where.priceRub.lte).toEqual(new Prisma.Decimal('2000.00'));
      expect(call.where.isActive).toBe(true);
      expect(call.orderBy).toEqual([{ priceRub: 'desc' }, { id: 'asc' }]);
      expect(call.take).toBe(200);
    });

    it('returns cheaper targets above the requested tier with their actual higher chance', async () => {
      // source 900, requested 50% => broad range [50%, 75%].
      // Target priceRub 1800 -> received 1620 -> chance 900/1620*100 = 55.5556%.
      (prisma.inventoryItem.findFirst as jest.Mock).mockResolvedValue(ownedItem);
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([
        { ...targetSkin, id: 30, priceRub: new Prisma.Decimal('1800.00') },
      ]);

      const result: any = await service.listOptions(123, {
        inventoryItemId: 10,
        chance: 50,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(30);
      expect(result.items[0].receivedValueRub).toBe('1620.00');
      expect(result.items[0].displayedChancePercent).toBe('55.5556');
    });

    it('sorts items by actual chance ascending, then price descending, then id ascending', async () => {
      // source 900, requested 50%, range [50%, 75%].
      // priceRub 2000 -> received 1800 -> chance 50.0000
      // priceRub 1500 -> received 1350 -> chance 66.6667
      // priceRub 1700 -> received 1530 -> chance 58.8235
      (prisma.inventoryItem.findFirst as jest.Mock).mockResolvedValue(ownedItem);
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([
        { ...targetSkin, id: 60, priceRub: new Prisma.Decimal('1500.00') },
        { ...targetSkin, id: 61, priceRub: new Prisma.Decimal('1700.00') },
        { ...targetSkin, id: 62, priceRub: new Prisma.Decimal('2000.00') },
      ]);

      const result: any = await service.listOptions(123, {
        inventoryItemId: 10,
        chance: 50,
      });

      expect(result.items.map((s: any) => s.id)).toEqual([62, 61, 60]);
    });

    it('excludes targets below the requested tier', async () => {
      // source 900, requested 50%, range [50%, 75%].
      // priceRub 2400 -> received 2160 -> chance 41.6667% < 50% => excluded.
      // priceRub 2000 -> received 1800 -> chance 50.0000% => included.
      (prisma.inventoryItem.findFirst as jest.Mock).mockResolvedValue(ownedItem);
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([
        { ...targetSkin, id: 70, priceRub: new Prisma.Decimal('2400.00') },
        { ...targetSkin, id: 71, priceRub: new Prisma.Decimal('2000.00') },
      ]);

      const result: any = await service.listOptions(123, {
        inventoryItemId: 10,
        chance: 50,
      });

      expect(result.items.map((s: any) => s.id)).toEqual([71]);
    });

    it('excludes targets above the configured max displayed chance', async () => {
      // source 900, requested 10%, range [10%, 75%].
      // priceRub 1100 -> received 990 -> chance 90.9091% > 75% => excluded.
      // priceRub 1500 -> received 1350 -> chance 66.6667% => included.
      (prisma.inventoryItem.findFirst as jest.Mock).mockResolvedValue(ownedItem);
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([
        { ...targetSkin, id: 80, priceRub: new Prisma.Decimal('1100.00') },
        { ...targetSkin, id: 81, priceRub: new Prisma.Decimal('1500.00') },
      ]);

      const result: any = await service.listOptions(123, {
        inventoryItemId: 10,
        chance: 10,
      });

      expect(result.items.map((s: any) => s.id)).toEqual([81]);
    });

    it('returns targets at 10%, 15%, and 25% when 10% tier is selected', async () => {
      // source 900, requested 10%, range [10%, 75%].
      // priceRub 10000 -> received 9000 -> chance 10.0000
      // priceRub 6666.67 -> received 6000 -> chance 15.0000
      // priceRub 4000 -> received 3600 -> chance 25.0000
      (prisma.inventoryItem.findFirst as jest.Mock).mockResolvedValue(ownedItem);
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([
        { ...targetSkin, id: 90, priceRub: new Prisma.Decimal('10000.00') },
        { ...targetSkin, id: 91, priceRub: new Prisma.Decimal('6666.67') },
        { ...targetSkin, id: 92, priceRub: new Prisma.Decimal('4000.00') },
      ]);

      const result: any = await service.listOptions(123, {
        inventoryItemId: 10,
        chance: 10,
      });

      expect(result.items.map((s: any) => s.id)).toEqual([90, 91, 92]);
      expect(result.items[0].displayedChancePercent).toBe('10.0000');
      expect(result.items[1].displayedChancePercent).toBe('15.0000');
      expect(result.items[2].displayedChancePercent).toBe('25.0000');
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

    it('uses correct target value and broad price range for the 25% tier', async () => {
      (prisma.inventoryItem.findFirst as jest.Mock).mockResolvedValue(ownedItem);
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([]);

      const result: any = await service.listOptions(123, {
        inventoryItemId: 10,
        chance: 25,
      });

      // ideal received = 900 / (25/100) = 3600; ideal raw = 3600/0.9 = 4000
      expect(result.targetValueRub).toBe('3600.00');
      // Broad range: [25%, 75%]
      // lowerReceived = 900 / 0.75 = 1200.00; rawLower = 1200 / 0.9 = 1333.33
      // upperReceived = 900 / 0.25 = 3600.00; rawUpper = 3600 / 0.9 = 4000.00
      const calls = (prisma.skin.findMany as jest.Mock).mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0].where.priceRub.gte).toEqual(
        new Prisma.Decimal('1333.33'),
      );
      expect(calls[0][0].where.priceRub.lte).toEqual(
        new Prisma.Decimal('4000.00'),
      );
    });

    it('applies the configured minimum lower bound when calculated target price is lower', async () => {
      (prisma.inventoryItem.findFirst as jest.Mock).mockResolvedValue({
        ...ownedItem,
        sellPriceRub: new Prisma.Decimal('3.00'),
      });
      (prisma.skin.findMany as jest.Mock).mockResolvedValue([]);

      await service.listOptions(123, {
        inventoryItemId: 10,
        chance: 75,
      });

      // ideal target = 3 / 0.75 = 4.00 which is below default 10 minimum.
      const findManyCall = (prisma.skin.findMany as jest.Mock).mock.calls[0][0];
      expect(findManyCall.where.priceRub.gte).toEqual(new Prisma.Decimal('10'));
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

    it('rejects when target skin is below the configured minimum', async () => {
      // source sellPrice 3, chance 75 => ideal 4.00 with upper bound 4.60.
      // target priced 4.00 satisfies the range checks but is below min 10.
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        ...ownedItem,
        sellPriceRub: new Prisma.Decimal('3.00'),
      });
      (prisma.skin.findUnique as jest.Mock).mockResolvedValue({
        ...targetSkin,
        priceRub: new Prisma.Decimal('4.00'),
      });

      await expect(
        service.createAttempt(123, {
          inventoryItemId: 10,
          targetSkinId: 20,
          chance: 75,
        }),
      ).rejects.toThrow('Target skin not found');
      expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
    });

    it('rejects when actual chance is above the configured max (target too cheap)', async () => {
      // source 900, requested 50%, broad range [50%, 75%].
      // priceRub 1100 -> received 990 -> chance 900/990*100 = 90.9091% > 75% max.
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(ownedItem);
      (prisma.skin.findUnique as jest.Mock).mockResolvedValue({
        ...targetSkin,
        priceRub: new Prisma.Decimal('1100.00'),
      });

      await expect(
        service.createAttempt(123, {
          inventoryItemId: 10,
          targetSkinId: 20,
          chance: 50,
        }),
      ).rejects.toThrow('too low for the selected chance');
    });

    it('rejects when actual chance is below the requested tier (target too expensive)', async () => {
      // source 900, requested 50%, broad range [50%, 75%].
      // priceRub 2400 -> received 2160 -> chance 900/2160*100 = 41.67% < 50%.
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(ownedItem);
      (prisma.skin.findUnique as jest.Mock).mockResolvedValue({
        ...targetSkin,
        priceRub: new Prisma.Decimal('2400.00'),
      });

      await expect(
        service.createAttempt(123, {
          inventoryItemId: 10,
          targetSkinId: 20,
          chance: 50,
        }),
      ).rejects.toThrow('too high for the selected chance');
    });

    it('accepts a 15% actual target when request chance is 10%', async () => {
      // source 900, requested 10%, broad range [10%, 75%].
      // priceRub 6666.67 -> received 6000.00 -> chance 900/6000*100 = 15.0000%.
      setupForAttempt({
        rollBasisPoints: 100_000,
        targetSkin: {
          ...targetSkin,
          priceRub: new Prisma.Decimal('6666.67'),
        },
      });

      const response: any = await service.createAttempt(123, {
        inventoryItemId: 10,
        targetSkinId: 20,
        chance: 10,
      });

      expect(response.displayedChancePercent).toBe('15.0000');
    });

    it('rejects a 9% actual target when request chance is 10%', async () => {
      // source 900, requested 10%, broad range [10%, 75%].
      // priceRub 11111.11 -> received 10000.00 -> chance 9.0000% < 10% requested.
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(ownedItem);
      (prisma.skin.findUnique as jest.Mock).mockResolvedValue({
        ...targetSkin,
        priceRub: new Prisma.Decimal('11111.11'),
      });

      await expect(
        service.createAttempt(123, {
          inventoryItemId: 10,
          targetSkinId: 20,
          chance: 10,
        }),
      ).rejects.toThrow('too high for the selected chance');
    });

    it('accepts target whose received value equals the ideal received value', async () => {
      // ideal received = 900 / 0.5 = 1800; priceRub 2000 -> received 1800.
      setupForAttempt({
        rollBasisPoints: 100_000,
        targetSkin: { ...targetSkin, priceRub: new Prisma.Decimal('2000.00') },
      });

      const response = await service.createAttempt(123, {
        inventoryItemId: 10,
        targetSkinId: 20,
        chance: 50,
      });
      expect(response.result).toBe('win');
    });

    it('returns targetReceivedValueRub equal to the won item sellPriceRub', async () => {
      setupForAttempt({ rollBasisPoints: 100_000 });

      const response: any = await service.createAttempt(123, {
        inventoryItemId: 10,
        targetSkinId: 20,
        chance: 50,
      });

      expect(response.targetReceivedValueRub).toBe('1800.00');
      const createCall = (prisma.inventoryItem.create as jest.Mock).mock
        .calls[0][0];
      expect(createCall.data.sellPriceRub.toString()).toBe('1800');
      expect(createCall.data.purchasePriceRub.toString()).toBe('2000');
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

    it('stores actual displayedChancePercent and applies house edge to it when target value differs from ideal', async () => {
      // source 900, requested 50%, broad range [50%, 75%].
      // priceRub 1800 -> received 1620 -> chance 900/1620*100 = 55.5556%.
      // effective = 55.5556 * (1 - 0.10) = 50.0000%.
      // The actual chance is what's stored, not the requested tier 50%.
      // EV = 0.5 * 1620 = 810 (~10% house edge held across the range).
      setupForAttempt({
        rollBasisPoints: 100_000,
        targetSkin: {
          ...targetSkin,
          priceRub: new Prisma.Decimal('1800.00'),
        },
      });

      await service.createAttempt(123, {
        inventoryItemId: 10,
        targetSkinId: 20,
        chance: 50,
      });

      const createCall = (prisma.upgradeAttempt.create as jest.Mock).mock
        .calls[0][0];
      const effective = new Prisma.Decimal(
        createCall.data.effectiveChancePercent,
      );
      const targetReceived = new Prisma.Decimal('1620.00');
      const ev = effective.div(100).mul(targetReceived);
      // EV must not exceed source value (no positive-EV plays for the user).
      expect(ev.lte(new Prisma.Decimal('900'))).toBe(true);
      // Effective chance should be below the actual displayed chance.
      expect(effective.lt(new Prisma.Decimal('55.5556'))).toBe(true);
      // displayedChancePercent stores the actual chance, not the requested tier.
      expect(createCall.data.displayedChancePercent.toString()).toBe(
        '55.5556',
      );
      // The requested tier the user selected is preserved in metadata.
      expect(createCall.data.metadata.requestedChancePercent).toBe('50.0000');
    });

    it('returns the actual displayedChancePercent (not the requested tier) in the response when target value differs from ideal', async () => {
      // priceRub 1800 -> received 1620 -> chance 55.5556%.
      setupForAttempt({
        rollBasisPoints: 100_000,
        targetSkin: {
          ...targetSkin,
          priceRub: new Prisma.Decimal('1800.00'),
        },
      });

      const response: any = await service.createAttempt(123, {
        inventoryItemId: 10,
        targetSkinId: 20,
        chance: 50,
      });

      expect(response.displayedChancePercent).toBe('55.5556');
      expect(response.targetReceivedValueRub).toBe('1620.00');
    });

    it('stores requestedChancePercent in attempt metadata for audit clarity', async () => {
      setupForAttempt({ rollBasisPoints: 100_000 });

      await service.createAttempt(123, {
        inventoryItemId: 10,
        targetSkinId: 20,
        chance: 50,
      });

      const createCall = (prisma.upgradeAttempt.create as jest.Mock).mock
        .calls[0][0];
      expect(createCall.data.metadata).toBeDefined();
      expect(createCall.data.metadata.requestedChancePercent).toBe('50.0000');
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

  describe('listHistory', () => {
    const sourceInventoryItem = {
      id: 10,
      status: 'upgraded_used',
      skin: { id: 1, name: 'AK-47 | Redline' },
    };

    const winAttempt = {
      id: 99,
      sourceValueRub: new Prisma.Decimal('900.00'),
      targetPriceRub: new Prisma.Decimal('1800.00'),
      displayedChancePercent: new Prisma.Decimal('50'),
      result: 'win',
      createdAt: new Date('2026-05-17T10:00:00Z'),
      sourceInventoryItem,
      targetSkin: { id: 20, name: 'AWP | Asiimov' },
      wonInventoryItem: {
        id: 500,
        status: 'owned',
        skin: { id: 20, name: 'AWP | Asiimov' },
      },
    };

    const lossAttempt = {
      ...winAttempt,
      id: 98,
      wonInventoryItemId: null,
      wonInventoryItem: null,
      result: 'loss',
      createdAt: new Date('2026-05-16T10:00:00Z'),
      sourceInventoryItem: { ...sourceInventoryItem, status: 'upgraded_lost' },
    };

    it('queries by userId, orders newest-first, and paginates', async () => {
      (prisma.upgradeAttempt.findMany as jest.Mock).mockResolvedValue([
        winAttempt,
      ]);
      (prisma.upgradeAttempt.count as jest.Mock).mockResolvedValue(45);

      const result = await service.listHistory(123, { page: 3, limit: 5 });

      const findManyCall = (prisma.upgradeAttempt.findMany as jest.Mock).mock
        .calls[0][0];
      expect(findManyCall.where).toEqual({ userId: 123 });
      expect(findManyCall.orderBy).toEqual({ createdAt: 'desc' });
      expect(findManyCall.skip).toBe(10);
      expect(findManyCall.take).toBe(5);
      expect(findManyCall.select.sourceInventoryItem).toBeDefined();
      expect(findManyCall.select.targetSkin).toBeDefined();
      expect(findManyCall.select.wonInventoryItem).toBeDefined();

      const sourceSelect = findManyCall.select.sourceInventoryItem.select;
      expect(sourceSelect).toEqual({
        id: true,
        status: true,
        skin: { select: expect.any(Object) },
      });
      expect(sourceSelect).not.toHaveProperty('metadata');
      expect(sourceSelect).not.toHaveProperty('userId');
      expect(sourceSelect).not.toHaveProperty('purchasePriceRub');
      expect(sourceSelect).not.toHaveProperty('sellPriceRub');
      expect(sourceSelect).not.toHaveProperty('source');

      const wonSelect = findManyCall.select.wonInventoryItem.select;
      expect(wonSelect).toEqual({
        id: true,
        status: true,
        skin: { select: expect.any(Object) },
      });
      expect(wonSelect).not.toHaveProperty('metadata');
      expect(wonSelect).not.toHaveProperty('userId');
      expect(wonSelect).not.toHaveProperty('purchasePriceRub');
      expect(wonSelect).not.toHaveProperty('sellPriceRub');
      expect(wonSelect).not.toHaveProperty('source');

      expect(findManyCall.select).not.toHaveProperty('metadata');
      expect(findManyCall.select).not.toHaveProperty('effectiveChancePercent');
      expect(findManyCall.select).not.toHaveProperty('houseEdgePercent');
      expect(findManyCall.select).not.toHaveProperty('rollPercent');

      const countCall = (prisma.upgradeAttempt.count as jest.Mock).mock
        .calls[0][0];
      expect(countCall.where).toEqual({ userId: 123 });

      expect(result.pagination).toEqual({
        page: 3,
        limit: 5,
        total: 45,
        totalPages: 9,
      });
    });

    it('applies default page=1 and limit=20 when not provided', async () => {
      (prisma.upgradeAttempt.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.upgradeAttempt.count as jest.Mock).mockResolvedValue(0);

      const result = await service.listHistory(123, {});

      const findManyCall = (prisma.upgradeAttempt.findMany as jest.Mock).mock
        .calls[0][0];
      expect(findManyCall.skip).toBe(0);
      expect(findManyCall.take).toBe(20);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
    });

    it('maps items including source, target, and won items without leaking hidden fields', async () => {
      (prisma.upgradeAttempt.findMany as jest.Mock).mockResolvedValue([
        winAttempt,
        lossAttempt,
      ]);
      (prisma.upgradeAttempt.count as jest.Mock).mockResolvedValue(2);

      const result = await service.listHistory(123, {});

      expect(result.items).toHaveLength(2);

      const [win, loss] = result.items;
      expect(win.id).toBe(99);
      expect(win.result).toBe('win');
      expect(win.displayedChancePercent).toBe('50.0000');
      expect(win.sourceValueRub).toBe('900.00');
      expect(win.targetPriceRub).toBe('1800.00');
      expect(win.sourceItem).toEqual(winAttempt.sourceInventoryItem);
      expect(win.targetSkin).toEqual(winAttempt.targetSkin);
      expect(win.wonItem).toEqual(winAttempt.wonInventoryItem);
      expect(win).not.toHaveProperty('effectiveChancePercent');
      expect(win).not.toHaveProperty('houseEdgePercent');
      expect(win).not.toHaveProperty('rollPercent');
      expect(win).not.toHaveProperty('metadata');

      for (const item of [win.sourceItem, win.wonItem]) {
        expect(item).not.toHaveProperty('metadata');
        expect(item).not.toHaveProperty('userId');
        expect(item).not.toHaveProperty('purchasePriceRub');
        expect(item).not.toHaveProperty('sellPriceRub');
        expect(item).not.toHaveProperty('source');
        expect(item).not.toHaveProperty('createdAt');
        expect(item).not.toHaveProperty('updatedAt');
      }

      expect(loss.result).toBe('loss');
      expect(loss.wonItem).toBeNull();
    });
  });

  describe('listDrops', () => {
    const publicSkin = {
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
      createdAt: new Date('2026-05-01T00:00:00Z'),
      updatedAt: new Date('2026-05-17T09:00:00Z'),
    };

    const winAttempt = (overrides: Partial<any> = {}) => ({
      id: 99,
      createdAt: new Date('2026-05-17T10:00:00Z'),
      targetPriceRub: new Prisma.Decimal('1800.00'),
      wonInventoryItem: { skin: publicSkin },
      ...overrides,
    });

    it('queries only winning attempts with a non-null wonInventoryItemId', async () => {
      (prisma.upgradeAttempt.findMany as jest.Mock).mockResolvedValue([
        winAttempt(),
      ]);

      await service.listDrops({});

      const findManyCall = (prisma.upgradeAttempt.findMany as jest.Mock).mock
        .calls[0][0];
      expect(findManyCall.where).toEqual({
        result: 'win',
        wonInventoryItemId: { not: null },
      });
    });

    it('orders newest-first by createdAt', async () => {
      (prisma.upgradeAttempt.findMany as jest.Mock).mockResolvedValue([]);

      await service.listDrops({});

      const findManyCall = (prisma.upgradeAttempt.findMany as jest.Mock).mock
        .calls[0][0];
      expect(findManyCall.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('applies default limit = 16 when none provided', async () => {
      (prisma.upgradeAttempt.findMany as jest.Mock).mockResolvedValue([]);

      await service.listDrops({});

      const findManyCall = (prisma.upgradeAttempt.findMany as jest.Mock).mock
        .calls[0][0];
      expect(findManyCall.take).toBe(16);
    });

    it('applies the requested limit', async () => {
      (prisma.upgradeAttempt.findMany as jest.Mock).mockResolvedValue([]);

      await service.listDrops({ limit: 5 });

      const findManyCall = (prisma.upgradeAttempt.findMany as jest.Mock).mock
        .calls[0][0];
      expect(findManyCall.take).toBe(5);
    });

    it('does not select hidden fields from the attempt', async () => {
      (prisma.upgradeAttempt.findMany as jest.Mock).mockResolvedValue([]);

      await service.listDrops({});

      const findManyCall = (prisma.upgradeAttempt.findMany as jest.Mock).mock
        .calls[0][0];
      const select = findManyCall.select;
      expect(select).toEqual({
        id: true,
        createdAt: true,
        targetPriceRub: true,
        wonInventoryItem: {
          select: {
            skin: { select: expect.any(Object) },
          },
        },
      });
      expect(select).not.toHaveProperty('userId');
      expect(select).not.toHaveProperty('user');
      expect(select).not.toHaveProperty('sourceInventoryItemId');
      expect(select).not.toHaveProperty('wonInventoryItemId');
      expect(select).not.toHaveProperty('effectiveChancePercent');
      expect(select).not.toHaveProperty('houseEdgePercent');
      expect(select).not.toHaveProperty('rollPercent');
      expect(select).not.toHaveProperty('metadata');
      expect(select).not.toHaveProperty('displayedChancePercent');
      expect(select).not.toHaveProperty('sourceValueRub');
      expect(select).not.toHaveProperty('result');

      const wonItemSelect = select.wonInventoryItem.select;
      expect(wonItemSelect).toEqual({
        skin: { select: expect.any(Object) },
      });
      expect(wonItemSelect).not.toHaveProperty('userId');
      expect(wonItemSelect).not.toHaveProperty('purchasePriceRub');
      expect(wonItemSelect).not.toHaveProperty('sellPriceRub');
      expect(wonItemSelect).not.toHaveProperty('metadata');
      expect(wonItemSelect).not.toHaveProperty('source');
      expect(wonItemSelect).not.toHaveProperty('status');
    });

    it('maps targetPriceRub Decimal to a fixed two-decimal string and exposes only public fields', async () => {
      (prisma.upgradeAttempt.findMany as jest.Mock).mockResolvedValue([
        winAttempt({
          id: 99,
          createdAt: new Date('2026-05-17T10:00:00Z'),
          targetPriceRub: new Prisma.Decimal('1800'),
        }),
        winAttempt({
          id: 100,
          createdAt: new Date('2026-05-17T11:00:00Z'),
          targetPriceRub: new Prisma.Decimal('2500.5'),
        }),
      ]);

      const result = await service.listDrops({});

      expect(result.items).toHaveLength(2);
      const [first, second] = result.items;

      expect(first.id).toBe(99);
      expect(first.priceRub).toBe('1800.00');
      expect(first.skin).toEqual(publicSkin);
      expect(first).not.toHaveProperty('userId');
      expect(first).not.toHaveProperty('user');
      expect(first).not.toHaveProperty('sourceInventoryItemId');
      expect(first).not.toHaveProperty('wonInventoryItemId');
      expect(first).not.toHaveProperty('effectiveChancePercent');
      expect(first).not.toHaveProperty('houseEdgePercent');
      expect(first).not.toHaveProperty('rollPercent');
      expect(first).not.toHaveProperty('metadata');

      expect(second.priceRub).toBe('2500.50');
    });

    it('filters out attempts where wonInventoryItem.skin is missing', async () => {
      (prisma.upgradeAttempt.findMany as jest.Mock).mockResolvedValue([
        winAttempt({ id: 1 }),
        winAttempt({ id: 2, wonInventoryItem: null }),
        winAttempt({ id: 3, wonInventoryItem: { skin: null } }),
      ]);

      const result = await service.listDrops({});

      expect(result.items.map((item) => item.id)).toEqual([1]);
    });
  });

  describe('listTopDrop', () => {
    const publicSkin = {
      id: 20,
      marketHashName: 'AWP | Asiimov (Field-Tested)',
      name: 'AWP | Asiimov',
      weapon: 'AWP',
      category: 'Sniper Rifle',
      rarity: 'Covert',
      exterior: 'Field-Tested',
      imageUrl: null,
      priceRub: new Prisma.Decimal('2000.00'),
      provider: 'waxpeer',
      providerItemId: 'awp-asiimov-ft',
      lastSyncedAt: null,
      isActive: true,
      createdAt: new Date('2026-05-01T00:00:00Z'),
      updatedAt: new Date('2026-05-17T09:00:00Z'),
    };

    const topAttempt = {
      id: 99,
      createdAt: new Date('2026-05-17T10:00:00Z'),
      targetPriceRub: new Prisma.Decimal('1800.00'),
      wonInventoryItem: {
        id: 500,
        status: 'sold',
        skin: publicSkin,
      },
    };

    it('queries only the authenticated user, winning attempts with a non-null wonInventoryItemId, ordered by value/createdAt/id desc', async () => {
      (prisma.upgradeAttempt.findFirst as jest.Mock).mockResolvedValue(
        topAttempt,
      );

      await service.listTopDrop(123);

      const call = (prisma.upgradeAttempt.findFirst as jest.Mock).mock
        .calls[0][0];
      expect(call.where).toEqual({
        userId: 123,
        result: 'win',
        wonInventoryItemId: { not: null },
      });
      expect(call.where).not.toHaveProperty('wonInventoryItem');
      expect(call.orderBy).toEqual([
        { targetPriceRub: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);
    });

    it('does not filter by won inventory item status (historical achievement)', async () => {
      (prisma.upgradeAttempt.findFirst as jest.Mock).mockResolvedValue(
        topAttempt,
      );

      await service.listTopDrop(123);

      const call = (prisma.upgradeAttempt.findFirst as jest.Mock).mock
        .calls[0][0];
      const wonItemSelect = call.select.wonInventoryItem;
      expect(wonItemSelect).toEqual({
        select: {
          id: true,
          status: true,
          skin: { select: expect.any(Object) },
        },
      });
      // No status / where filter on the nested relation.
      expect(wonItemSelect).not.toHaveProperty('where');
    });

    it('selects only the safe attempt fields and the public won-item shape', async () => {
      (prisma.upgradeAttempt.findFirst as jest.Mock).mockResolvedValue(
        topAttempt,
      );

      await service.listTopDrop(123);

      const select = (prisma.upgradeAttempt.findFirst as jest.Mock).mock
        .calls[0][0].select;
      expect(select).toEqual({
        id: true,
        createdAt: true,
        targetPriceRub: true,
        wonInventoryItem: {
          select: {
            id: true,
            status: true,
            skin: { select: expect.any(Object) },
          },
        },
      });
      expect(select).not.toHaveProperty('userId');
      expect(select).not.toHaveProperty('user');
      expect(select).not.toHaveProperty('sourceInventoryItemId');
      expect(select).not.toHaveProperty('sourceInventoryItem');
      expect(select).not.toHaveProperty('targetSkinId');
      expect(select).not.toHaveProperty('wonInventoryItemId');
      expect(select).not.toHaveProperty('effectiveChancePercent');
      expect(select).not.toHaveProperty('houseEdgePercent');
      expect(select).not.toHaveProperty('rollPercent');
      expect(select).not.toHaveProperty('metadata');
      expect(select).not.toHaveProperty('displayedChancePercent');
      expect(select).not.toHaveProperty('sourceValueRub');
      expect(select).not.toHaveProperty('result');

      const wonItemSelect = select.wonInventoryItem.select;
      expect(wonItemSelect).not.toHaveProperty('userId');
      expect(wonItemSelect).not.toHaveProperty('purchasePriceRub');
      expect(wonItemSelect).not.toHaveProperty('sellPriceRub');
      expect(wonItemSelect).not.toHaveProperty('metadata');
      expect(wonItemSelect).not.toHaveProperty('source');
    });

    it('maps targetPriceRub to priceRub with two decimals and returns the won item with skin', async () => {
      (prisma.upgradeAttempt.findFirst as jest.Mock).mockResolvedValue({
        ...topAttempt,
        targetPriceRub: new Prisma.Decimal('2500.5'),
      });

      const result = await service.listTopDrop(123);

      expect(result.topDrop).toEqual({
        id: 99,
        createdAt: new Date('2026-05-17T10:00:00Z'),
        priceRub: '2500.50',
        wonItem: {
          id: 500,
          status: 'sold',
          skin: publicSkin,
        },
      });
      expect(result.topDrop).not.toHaveProperty('userId');
      expect(result.topDrop).not.toHaveProperty('effectiveChancePercent');
      expect(result.topDrop).not.toHaveProperty('houseEdgePercent');
      expect(result.topDrop).not.toHaveProperty('rollPercent');
      expect(result.topDrop).not.toHaveProperty('metadata');
      expect(result.topDrop).not.toHaveProperty('targetSkinId');
      expect(result.topDrop).not.toHaveProperty('wonInventoryItemId');
    });

    it('keeps eligibility for sold and withdrawal-related won item statuses', async () => {
      for (const status of ['sold', 'withdraw_pending', 'withdrawn']) {
        (prisma.upgradeAttempt.findFirst as jest.Mock).mockResolvedValueOnce({
          ...topAttempt,
          wonInventoryItem: { ...topAttempt.wonInventoryItem, status },
        });

        const result = await service.listTopDrop(123);
        expect(result.topDrop?.wonItem.status).toBe(status);
        expect(result.topDrop?.id).toBe(99);
      }
    });

    it('returns { topDrop: null } when no attempt is found', async () => {
      (prisma.upgradeAttempt.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.listTopDrop(123);

      expect(result).toEqual({ topDrop: null });
    });

    it('returns { topDrop: null } defensively when the won item is missing', async () => {
      (prisma.upgradeAttempt.findFirst as jest.Mock).mockResolvedValue({
        ...topAttempt,
        wonInventoryItem: null,
      });

      const result = await service.listTopDrop(123);

      expect(result).toEqual({ topDrop: null });
    });

    it('returns { topDrop: null } defensively when the joined skin is missing', async () => {
      (prisma.upgradeAttempt.findFirst as jest.Mock).mockResolvedValue({
        ...topAttempt,
        wonInventoryItem: { ...topAttempt.wonInventoryItem, skin: null },
      });

      const result = await service.listTopDrop(123);

      expect(result).toEqual({ topDrop: null });
    });
  });
});
