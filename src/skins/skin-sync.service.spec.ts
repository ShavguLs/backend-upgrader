/* eslint-disable */
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FxRateService } from './fx-rate.service';
import { SkinSyncService } from './skin-sync.service';
import { SkinProvider } from './providers/skin-provider.interface';
import { WaxpeerProvider } from './providers/waxpeer.provider';

describe('SkinSyncService', () => {
  const originalEnv = { ...process.env };

  let prisma: any;
  let fxRate: FxRateService;
  let waxpeer: WaxpeerProvider;

  beforeEach(() => {
    process.env = { ...originalEnv, SKIN_PRICE_MARKUP_PERCENT: '8' };
    prisma = {
      skin: {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    fxRate = { getUsdToRubRate: jest.fn() } as any;
    waxpeer = { getName: () => 'waxpeer', getCatalog: jest.fn() } as any;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function buildService(): SkinSyncService {
    return new SkinSyncService(
      prisma as PrismaService,
      fxRate,
      waxpeer,
    );
  }

  it('upserts valid skins with RUB price using FX rate and markup', async () => {
    (fxRate.getUsdToRubRate as jest.Mock).mockResolvedValue(90);
    const provider: SkinProvider = {
      getName: () => 'waxpeer',
      getCatalog: async () => [
        {
          marketHashName: 'AK-47 | Redline (Field-Tested)',
          providerPriceUsd: '31.3860',
          imageUrl: 'https://images.waxpeer.com/i/redline.webp',
          category: 'Rifles',
          rarityColor: '#d32ce6',
          availableCount: 484,
          providerItemId: 'AK-47 | Redline (Field-Tested)',
          rawData: { name: 'AK-47 | Redline (Field-Tested)' },
        },
      ],
    };

    const service = buildService();
    const result = await service.syncOnce(provider);

    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);

    const upsertCall = prisma.skin.upsert.mock.calls[0][0];
    expect(upsertCall.where).toEqual({
      marketHashName: 'AK-47 | Redline (Field-Tested)',
    });

    const expectedPrice = new Prisma.Decimal('31.3860')
      .mul(new Prisma.Decimal('90'))
      .mul(new Prisma.Decimal('1.08'))
      .toDecimalPlaces(2);

    expect(upsertCall.update.priceRub.toString()).toBe(expectedPrice.toString());
    expect(upsertCall.update.name).toBe('AK-47 | Redline');
    expect(upsertCall.update.weapon).toBe('AK-47');
    expect(upsertCall.update.exterior).toBe('Field-Tested');
    expect(upsertCall.update.rarity).toBe('Classified');
    expect(upsertCall.update.provider).toBe('waxpeer');
    expect(upsertCall.update.isActive).toBe(true);
    expect(upsertCall.create.marketHashName).toBe(
      'AK-47 | Redline (Field-Tested)',
    );
  });

  it('marks stale and under-min waxpeer rows inactive after a successful sync', async () => {
    (fxRate.getUsdToRubRate as jest.Mock).mockResolvedValue(90);
    prisma.skin.updateMany
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 2 });

    const provider: SkinProvider = {
      getName: () => 'waxpeer',
      getCatalog: async () => [],
    };

    const service = buildService();
    const result = await service.syncOnce(provider);

    expect(result.inactivated).toBe(5);
    expect(prisma.skin.updateMany).toHaveBeenCalledTimes(2);

    const staleWhere = prisma.skin.updateMany.mock.calls[0][0].where;
    expect(staleWhere.provider).toBe('waxpeer');
    expect(staleWhere.isActive).toBe(true);
    expect(staleWhere.OR).toBeDefined();

    const belowMinWhere = prisma.skin.updateMany.mock.calls[1][0].where;
    expect(belowMinWhere.provider).toBe('waxpeer');
    expect(belowMinWhere.isActive).toBe(true);
    expect(belowMinWhere.priceRub).toEqual({
      lt: new Prisma.Decimal('10'),
    });
  });

  it('does not mark stale rows inactive when provider fetch fails', async () => {
    (fxRate.getUsdToRubRate as jest.Mock).mockResolvedValue(90);
    const provider: SkinProvider = {
      getName: () => 'waxpeer',
      getCatalog: async () => {
        throw new Error('provider down');
      },
    };

    const service = buildService();
    await expect(service.syncOnce(provider)).rejects.toThrow(/provider down/);

    expect(prisma.skin.updateMany).not.toHaveBeenCalled();
    expect(prisma.skin.upsert).not.toHaveBeenCalled();
  });

  it('does not mark stale rows inactive when FX rate is unavailable', async () => {
    (fxRate.getUsdToRubRate as jest.Mock).mockRejectedValue(
      new Error('FX rate unavailable'),
    );
    const provider: SkinProvider = {
      getName: () => 'waxpeer',
      getCatalog: jest.fn(),
    };

    const service = buildService();
    await expect(service.syncOnce(provider)).rejects.toThrow(/FX rate/);

    expect(provider.getCatalog).not.toHaveBeenCalled();
    expect(prisma.skin.updateMany).not.toHaveBeenCalled();
  });

  it('skips converted RUB prices below the configured minimum', async () => {
    (fxRate.getUsdToRubRate as jest.Mock).mockResolvedValue(90);
    // 0.05 USD * 90 * 1.08 = 4.86 RUB which is below default 10 RUB minimum.
    const provider: SkinProvider = {
      getName: () => 'waxpeer',
      getCatalog: async () => [
        {
          marketHashName: 'Cheap | Sticker (Factory New)',
          providerPriceUsd: '0.05',
          imageUrl: 'https://x/c.webp',
          rawData: {},
        },
      ],
    };

    const service = buildService();
    const result = await service.syncOnce(provider);

    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(1);
    expect(prisma.skin.upsert).not.toHaveBeenCalled();
  });

  it('upserts converted RUB prices equal to the configured minimum', async () => {
    (fxRate.getUsdToRubRate as jest.Mock).mockResolvedValue(100);
    process.env.SKIN_PRICE_MARKUP_PERCENT = '0';
    // 0.10 USD * 100 = 10.00 RUB, equal to minimum.
    const provider: SkinProvider = {
      getName: () => 'waxpeer',
      getCatalog: async () => [
        {
          marketHashName: 'Edge | Skin (Factory New)',
          providerPriceUsd: '0.10',
          imageUrl: 'https://x/e.webp',
          rawData: {},
        },
      ],
    };

    const service = buildService();
    const result = await service.syncOnce(provider);

    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(0);
    expect(prisma.skin.upsert).toHaveBeenCalledTimes(1);
  });

  it('respects custom SKIN_MIN_PRICE_RUB when skipping under-min items', async () => {
    (fxRate.getUsdToRubRate as jest.Mock).mockResolvedValue(90);
    process.env.SKIN_MIN_PRICE_RUB = '500';
    // 1 USD * 90 * 1.08 = 97.20 RUB, below 500 minimum.
    const provider: SkinProvider = {
      getName: () => 'waxpeer',
      getCatalog: async () => [
        {
          marketHashName: 'Below | Custom (Factory New)',
          providerPriceUsd: '1.0',
          imageUrl: 'https://x/b.webp',
          rawData: {},
        },
      ],
    };

    const service = buildService();
    const result = await service.syncOnce(provider);

    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(1);
    expect(prisma.skin.upsert).not.toHaveBeenCalled();
  });

  it('rejects invalid SKIN_MIN_PRICE_RUB at construction time', () => {
    process.env.SKIN_MIN_PRICE_RUB = '-1';
    expect(() => buildService()).toThrow('SKIN_MIN_PRICE_RUB must be >= 0');
  });

  it('skips items with invalid provider price but keeps syncing others', async () => {
    (fxRate.getUsdToRubRate as jest.Mock).mockResolvedValue(90);
    const provider: SkinProvider = {
      getName: () => 'waxpeer',
      getCatalog: async () => [
        {
          marketHashName: 'Zero | Price (Factory New)',
          providerPriceUsd: '0',
          imageUrl: 'https://x/0.webp',
          rawData: {},
        },
        {
          marketHashName: 'Valid | Item (Factory New)',
          providerPriceUsd: '1.0',
          imageUrl: 'https://x/v.webp',
          rawData: {},
        },
      ],
    };

    const service = buildService();
    const result = await service.syncOnce(provider);

    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(1);
    expect(prisma.skin.upsert).toHaveBeenCalledTimes(1);
  });
});
