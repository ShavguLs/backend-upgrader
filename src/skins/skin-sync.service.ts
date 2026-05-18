import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FxRateService } from './fx-rate.service';
import { normalizeSkin } from './skin-normalizer';
import { WaxpeerProvider } from './providers/waxpeer.provider';
import { SkinProvider } from './providers/skin-provider.interface';

@Injectable()
export class SkinSyncService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SkinSyncService.name);
  private readonly providerName = (
    process.env.SKIN_PROVIDER || ''
  ).toLowerCase();
  private readonly syncIntervalMs =
    (Number(process.env.SKIN_SYNC_INTERVAL_SECONDS) || 300) * 1000;
  private readonly staleAfterMs =
    (Number(process.env.SKIN_STALE_AFTER_MINUTES) || 30) * 60 * 1000;
  private readonly markupPercent = (() => {
    const value = new Prisma.Decimal(
      process.env.SKIN_PRICE_MARKUP_PERCENT || '0',
    );
    if (value.lt(0)) {
      throw new Error('SKIN_PRICE_MARKUP_PERCENT must be >= 0');
    }
    return value;
  })();
  private readonly minPriceRub = (() => {
    const value = new Prisma.Decimal(process.env.SKIN_MIN_PRICE_RUB || '10');
    if (value.lt(0)) {
      throw new Error('SKIN_MIN_PRICE_RUB must be >= 0');
    }
    return value;
  })();

  private timer: NodeJS.Timeout | null = null;
  private isSyncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fxRateService: FxRateService,
    private readonly waxpeerProvider: WaxpeerProvider,
  ) {}

  async onApplicationBootstrap() {
    if (!this.isWaxpeerEnabled()) {
      this.logger.log(
        `SKIN_PROVIDER is "${this.providerName || '(unset)'}", skipping Waxpeer sync.`,
      );
      return;
    }

    void this.runSyncSafely();
    this.timer = setInterval(() => {
      void this.runSyncSafely();
    }, this.syncIntervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private isWaxpeerEnabled(): boolean {
    return this.providerName === 'waxpeer';
  }

  private async runSyncSafely(): Promise<void> {
    if (this.isSyncing) {
      this.logger.debug('Sync already in progress, skipping tick.');
      return;
    }
    this.isSyncing = true;
    try {
      await this.syncOnce(this.waxpeerProvider);
    } catch (error) {
      this.logger.error(
        `Skin sync failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    } finally {
      this.isSyncing = false;
    }
  }

  async syncOnce(provider: SkinProvider): Promise<{
    synced: number;
    skipped: number;
    failed: number;
    inactivated: number;
  }> {
    const providerName = provider.getName();
    const startedAt = new Date();

    const usdRubRate = await this.fxRateService.getUsdToRubRate();
    const fxDecimal = new Prisma.Decimal(usdRubRate.toString());
    const markupMultiplier = new Prisma.Decimal(1).plus(
      this.markupPercent.div(100),
    );

    const items = await provider.getCatalog();

    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of items) {
      try {
        const providerPriceUsd = new Prisma.Decimal(item.providerPriceUsd);
        if (providerPriceUsd.lte(0)) {
          skipped++;
          continue;
        }

        const priceRub = providerPriceUsd
          .mul(fxDecimal)
          .mul(markupMultiplier)
          .toDecimalPlaces(2);

        if (priceRub.lte(0)) {
          skipped++;
          continue;
        }

        if (priceRub.lt(this.minPriceRub)) {
          skipped++;
          continue;
        }

        const normalized = normalizeSkin({
          marketHashName: item.marketHashName,
          category: item.category,
          rarityColor: item.rarityColor,
        });

        const data = {
          name: normalized.name,
          weapon: normalized.weapon,
          category: normalized.category,
          rarity: normalized.rarity,
          exterior: normalized.exterior,
          imageUrl: item.imageUrl,
          priceRub,
          provider: providerName,
          providerItemId: item.providerItemId ?? item.marketHashName,
          providerRawData: item.rawData as Prisma.InputJsonValue,
          lastSyncedAt: startedAt,
          isActive: true,
        };

        await this.prisma.skin.upsert({
          where: { marketHashName: item.marketHashName },
          update: data,
          create: { marketHashName: item.marketHashName, ...data },
        });
        synced++;
      } catch (error) {
        failed++;
        this.logger.warn(
          `Failed to upsert skin "${item.marketHashName}": ${(error as Error).message}`,
        );
      }
    }

    const inactivated = await this.markStaleInactive(providerName, startedAt);

    this.logger.log(
      `Skin sync done. provider=${providerName} synced=${synced} skipped=${skipped} failed=${failed} inactivated=${inactivated} fxRate=${usdRubRate}`,
    );

    return { synced, skipped, failed, inactivated };
  }

  private async markStaleInactive(
    providerName: string,
    startedAt: Date,
  ): Promise<number> {
    const threshold = new Date(startedAt.getTime() - this.staleAfterMs);
    const staleResult = await this.prisma.skin.updateMany({
      where: {
        provider: providerName,
        isActive: true,
        OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: threshold } }],
      },
      data: { isActive: false },
    });
    const belowMinResult = await this.prisma.skin.updateMany({
      where: {
        provider: providerName,
        isActive: true,
        priceRub: { lt: this.minPriceRub },
      },
      data: { isActive: false },
    });
    return staleResult.count + belowMinResult.count;
  }
}
