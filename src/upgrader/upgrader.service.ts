import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUpgradeAttemptDto } from './dto/create-upgrade-attempt.dto';
import {
  ListUpgradeOptionsDto,
  UPGRADE_CHANCE_TIERS,
} from './dto/list-upgrade-options.dto';

const HUNDRED = new Prisma.Decimal(100);

@Injectable()
export class UpgraderService {
  private readonly publicSkinSelect = {
    id: true,
    marketHashName: true,
    name: true,
    weapon: true,
    category: true,
    rarity: true,
    exterior: true,
    imageUrl: true,
    priceRub: true,
    provider: true,
    providerItemId: true,
    lastSyncedAt: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.SkinSelect;

  private readonly sellbackPercent = (() => {
    const value = new Prisma.Decimal(process.env.SKIN_SELLBACK_PERCENT || '90');

    if (value.lt(0) || value.gt(100)) {
      throw new Error('SKIN_SELLBACK_PERCENT must be between 0 and 100');
    }

    return value;
  })();

  private readonly houseEdgePercent = (() => {
    const value = new Prisma.Decimal(
      process.env.UPGRADER_HOUSE_EDGE_PERCENT || '10',
    );
    if (value.lt(0) || value.gte(100)) {
      throw new Error('UPGRADER_HOUSE_EDGE_PERCENT must be >= 0 and < 100');
    }
    return value;
  })();

  private readonly minDisplayedChancePercent = (() => {
    const value = new Prisma.Decimal(
      process.env.UPGRADER_MIN_DISPLAYED_CHANCE_PERCENT || '1',
    );
    if (value.lte(0)) {
      throw new Error('UPGRADER_MIN_DISPLAYED_CHANCE_PERCENT must be > 0');
    }
    return value;
  })();

  private readonly maxDisplayedChancePercent = (() => {
    const value = new Prisma.Decimal(
      process.env.UPGRADER_MAX_DISPLAYED_CHANCE_PERCENT || '75',
    );
    if (value.gt(95)) {
      throw new Error('UPGRADER_MAX_DISPLAYED_CHANCE_PERCENT must be <= 95');
    }
    return value;
  })();

  private readonly targetPriceTolerancePercent = (() => {
    const value = new Prisma.Decimal(
      process.env.UPGRADER_TARGET_PRICE_TOLERANCE_PERCENT || '15',
    );
    if (value.lt(0)) {
      throw new Error('UPGRADER_TARGET_PRICE_TOLERANCE_PERCENT must be >= 0');
    }
    return value;
  })();

  constructor(private readonly prisma: PrismaService) {
    if (this.minDisplayedChancePercent.gte(this.maxDisplayedChancePercent)) {
      throw new Error(
        'UPGRADER_MIN_DISPLAYED_CHANCE_PERCENT must be less than UPGRADER_MAX_DISPLAYED_CHANCE_PERCENT',
      );
    }
  }

  async listOptions(userId: number, query: ListUpgradeOptionsDto) {
    const sourceItem = await this.prisma.inventoryItem.findFirst({
      where: { id: query.inventoryItemId, userId, status: 'owned' },
    });
    if (!sourceItem) {
      throw new BadRequestException('Inventory item not found or not owned');
    }

    const sourceValueRub = sourceItem.sellPriceRub;
    const displayedChancePercent = new Prisma.Decimal(query.chance);
    this.validateDisplayedChance(displayedChancePercent);
    const targetPriceRub = sourceValueRub
      .mul(HUNDRED)
      .div(displayedChancePercent)
      .toDecimalPlaces(2);

    const upperBound = targetPriceRub
      .mul(new Prisma.Decimal(1).plus(this.targetPriceTolerancePercent.div(100)))
      .toDecimalPlaces(2);

    const candidates = await this.prisma.skin.findMany({
      where: {
        isActive: true,
        priceRub: {
          gte: targetPriceRub,
          lte: upperBound,
        },
      },
      select: this.publicSkinSelect,
      orderBy: [{ priceRub: 'asc' }, { id: 'asc' }],
      take: 200,
    });

    const sorted = candidates
      .map((skin) => ({
        skin,
        distance: skin.priceRub.minus(targetPriceRub).abs(),
      }))
      .sort((a, b) => {
        const diff = a.distance.cmp(b.distance);
        if (diff !== 0) return diff;
        const priceCmp = a.skin.priceRub.cmp(b.skin.priceRub);
        if (priceCmp !== 0) return priceCmp;
        return a.skin.id - b.skin.id;
      })
      .slice(0, 24)
      .map((entry) => entry.skin);

    return {
      sourceValueRub: sourceValueRub.toFixed(2),
      displayedChancePercent: displayedChancePercent.toFixed(4),
      targetPriceRub: targetPriceRub.toFixed(2),
      items: sorted,
    };
  }

  async createAttempt(userId: number, dto: CreateUpgradeAttemptDto) {
    const sourceItem = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.inventoryItemId },
    });
    if (!sourceItem || sourceItem.userId !== userId) {
      throw new BadRequestException('Inventory item not found or not owned');
    }
    if (sourceItem.status !== 'owned') {
      throw new BadRequestException('Item is not available for upgrade');
    }

    const targetSkin = await this.prisma.skin.findUnique({
      where: { id: dto.targetSkinId },
    });
    if (!targetSkin || !targetSkin.isActive) {
      throw new BadRequestException('Target skin not found');
    }

    const sourceValueRub = sourceItem.sellPriceRub;
    const displayedChancePercent = new Prisma.Decimal(dto.chance);
    this.validateDisplayedChance(displayedChancePercent);

    const idealTargetPriceRub = sourceValueRub
      .mul(HUNDRED)
      .div(displayedChancePercent)
      .toDecimalPlaces(2);
    const upperBoundPriceRub = idealTargetPriceRub
      .mul(new Prisma.Decimal(1).plus(this.targetPriceTolerancePercent.div(100)))
      .toDecimalPlaces(2);

    if (targetSkin.priceRub.lt(idealTargetPriceRub)) {
      throw new BadRequestException(
        'Target skin price is too low for the selected chance',
      );
    }
    if (targetSkin.priceRub.gt(upperBoundPriceRub)) {
      throw new BadRequestException(
        'Target skin price is too high for the selected chance',
      );
    }

    const effectiveChancePercent = displayedChancePercent
      .mul(new Prisma.Decimal(1).minus(this.houseEdgePercent.div(100)))
      .toDecimalPlaces(4);

    const rollBasisPoints = randomInt(1, 1_000_001);
    const rollPercent = new Prisma.Decimal(rollBasisPoints)
      .div(10_000)
      .toDecimalPlaces(4);
    const isWin = rollPercent.lte(effectiveChancePercent);

    const targetSellPriceRub = targetSkin.priceRub
      .mul(this.sellbackPercent)
      .div(100)
      .toDecimalPlaces(2);

    const result = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.inventoryItem.updateMany({
        where: { id: sourceItem.id, userId, status: 'owned' },
        data: { status: isWin ? 'upgraded_used' : 'upgraded_lost' },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Item is not available for upgrade');
      }

      const attemptMetadata: Prisma.InputJsonValue = {
        houseEdgePercent: this.houseEdgePercent.toFixed(4),
        sourceSkinId: sourceItem.skinId,
      };

      const attempt = await tx.upgradeAttempt.create({
        data: {
          userId,
          sourceInventoryItemId: sourceItem.id,
          targetSkinId: targetSkin.id,
          sourceValueRub,
          targetPriceRub: targetSkin.priceRub,
          displayedChancePercent,
          effectiveChancePercent,
          houseEdgePercent: this.houseEdgePercent,
          rollPercent,
          result: isWin ? 'win' : 'loss',
          metadata: attemptMetadata,
        },
      });

      const auditMetadata: Prisma.InputJsonValue = {
        upgradeAttemptId: attempt.id,
        sourceInventoryItemId: sourceItem.id,
        targetSkinId: targetSkin.id,
        displayedChancePercent: displayedChancePercent.toFixed(4),
        effectiveChancePercent: effectiveChancePercent.toFixed(4),
        houseEdgePercent: this.houseEdgePercent.toFixed(4),
        rollPercent: rollPercent.toFixed(4),
      };

      let wonItem: Awaited<
        ReturnType<typeof tx.inventoryItem.findUnique>
      > | null = null;

      if (isWin) {
        const wonItemMetadata: Prisma.InputJsonValue = {
          upgradeAttemptId: attempt.id,
          sourceInventoryItemId: sourceItem.id,
          targetSkinId: targetSkin.id,
          displayedChancePercent: displayedChancePercent.toFixed(4),
          sourceValueRub: sourceValueRub.toFixed(2),
          targetPriceRub: targetSkin.priceRub.toFixed(2),
          skinMarketHashName: targetSkin.marketHashName,
        };

        wonItem = await tx.inventoryItem.create({
          data: {
            userId,
            skinId: targetSkin.id,
            purchasePriceRub: targetSkin.priceRub,
            sellPriceRub: targetSellPriceRub,
            status: 'owned',
            source: 'upgrade',
            metadata: wonItemMetadata,
          },
          include: { skin: { select: this.publicSkinSelect } },
        });

        await tx.upgradeAttempt.update({
          where: { id: attempt.id },
          data: { wonInventoryItemId: wonItem.id },
        });

        await tx.inventoryTransaction.create({
          data: {
            userId,
            inventoryItemId: sourceItem.id,
            type: 'upgrade_win_source',
            amountRub: sourceValueRub,
            metadata: auditMetadata,
          },
        });

        await tx.inventoryTransaction.create({
          data: {
            userId,
            inventoryItemId: wonItem.id,
            type: 'upgrade_win_target',
            amountRub: targetSkin.priceRub,
            metadata: auditMetadata,
          },
        });
      } else {
        await tx.inventoryTransaction.create({
          data: {
            userId,
            inventoryItemId: sourceItem.id,
            type: 'upgrade_loss',
            amountRub: sourceValueRub,
            metadata: auditMetadata,
          },
        });
      }

      const refreshedSource = await tx.inventoryItem.findUnique({
        where: { id: sourceItem.id },
        include: { skin: { select: this.publicSkinSelect } },
      });

      const refreshedAttempt = await tx.upgradeAttempt.findUnique({
        where: { id: attempt.id },
      });

      return {
        sourceItem: refreshedSource,
        wonItem,
        attempt: refreshedAttempt!,
      };
    });

    return {
      result: isWin ? 'win' : 'loss',
      displayedChancePercent: displayedChancePercent.toFixed(4),
      sourceItem: result.sourceItem,
      wonItem: result.wonItem,
      targetSkin: this.pickPublicSkinFields(targetSkin),
      attempt: {
        id: result.attempt.id,
        result: result.attempt.result,
        createdAt: result.attempt.createdAt,
      },
    };
  }

  private validateDisplayedChance(displayedChancePercent: Prisma.Decimal) {
    if (displayedChancePercent.lt(this.minDisplayedChancePercent)) {
      throw new BadRequestException(
        'Upgrade chance is below the allowed minimum',
      );
    }
    if (displayedChancePercent.gt(this.maxDisplayedChancePercent)) {
      throw new BadRequestException(
        'Upgrade chance is above the allowed maximum',
      );
    }
  }

  private pickPublicSkinFields<T extends Record<string, unknown>>(skin: T) {
    const keys = Object.keys(this.publicSkinSelect) as (keyof T)[];
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      out[key as string] = skin[key];
    }
    return out;
  }

  static readonly chanceTiers = UPGRADE_CHANCE_TIERS;
}
