import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FxRateService } from '../skins/fx-rate.service';
import {
  WaxpeerWithdrawalProvider,
  WaxpeerListing,
} from '../skins/providers/waxpeer-withdrawal.provider';
import { BuySkinDto } from './dto/buy-skin.dto';
import { ListSkinsDto } from './dto/list-skins.dto';
import { SellInventoryItemDto } from './dto/sell-inventory-item.dto';
import { WithdrawInventoryItemDto } from './dto/withdraw-inventory-item.dto';

@Injectable()
export class InventoryService {
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

  private readonly logger = new Logger(InventoryService.name);
  private readonly markupPercent = (() => {
    const value = new Prisma.Decimal(
      process.env.SKIN_PRICE_MARKUP_PERCENT || '0',
    );
    if (value.lt(0)) {
      throw new Error('SKIN_PRICE_MARKUP_PERCENT must be >= 0');
    }
    return value;
  })();

  constructor(
    private readonly prisma: PrismaService,
    private readonly waxpeerWithdrawal: WaxpeerWithdrawalProvider,
    private readonly fxRateService: FxRateService,
  ) {}

  async getSkins(query: ListSkinsDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;
    const where: Prisma.SkinWhereInput = {
      isActive: true,
    };

    const search = query.search?.trim().slice(0, 100);
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { marketHashName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.weapon) {
      where.weapon = query.weapon;
    }
    if (query.rarity) {
      where.rarity = query.rarity;
    }
    if (query.exterior) {
      where.exterior = query.exterior;
    }
    if (query.minPriceRub !== undefined || query.maxPriceRub !== undefined) {
      const priceRub: Prisma.DecimalFilter = {};

      if (query.minPriceRub !== undefined) {
        priceRub.gte = new Prisma.Decimal(query.minPriceRub.toString());
      }
      if (query.maxPriceRub !== undefined) {
        priceRub.lte = new Prisma.Decimal(query.maxPriceRub.toString());
      }

      where.priceRub = priceRub;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.skin.findMany({
        where,
        select: this.publicSkinSelect,
        orderBy: [{ priceRub: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.skin.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getSkin(id: number) {
    const skin = await this.prisma.skin.findUnique({
      where: { id },
      select: this.publicSkinSelect,
    });

    if (!skin || !skin.isActive) {
      throw new NotFoundException('Skin not found');
    }

    return skin;
  }

  async getInventory(userId: number) {
    return this.prisma.inventoryItem.findMany({
      where: { userId, status: { in: ['owned', 'withdraw_pending'] } },
      include: { skin: { select: this.publicSkinSelect } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async buySkin(userId: number, dto: BuySkinDto) {
    return this.prisma.$transaction(async (tx) => {
      const skin = await tx.skin.findUnique({ where: { id: dto.skinId } });
      if (!skin) {
        throw new NotFoundException('Skin not found');
      }
      if (!skin.isActive) {
        throw new BadRequestException('Skin is not active');
      }

      await tx.wallet.upsert({
        where: { userId },
        update: {},
        create: {
          userId,
          balance: new Prisma.Decimal(0),
          currency: 'RUB',
        },
      });

      const sellPriceRub = skin.priceRub
        .mul(this.sellbackPercent)
        .div(100)
        .toDecimalPlaces(2);

      const debit = await tx.wallet.updateMany({
        where: { userId, balance: { gte: skin.priceRub } },
        data: { balance: { decrement: skin.priceRub } },
      });

      if (debit.count === 0) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      const updatedWallet = await tx.wallet.findUnique({ where: { userId } });
      if (!updatedWallet) {
        throw new NotFoundException('Wallet not found after purchase');
      }

      const providerPriceUsdThousandthsAtPurchase =
        await this.derivePriceCapThousandths(skin.priceRub);

      const metadata: Record<string, unknown> = {
        skinMarketHashName: skin.marketHashName,
        skinPriceRub: skin.priceRub.toString(),
      };
      if (providerPriceUsdThousandthsAtPurchase !== null) {
        metadata.providerPriceUsdThousandthsAtPurchase =
          providerPriceUsdThousandthsAtPurchase;
      }

      const item = await tx.inventoryItem.create({
        data: {
          userId,
          skinId: skin.id,
          purchasePriceRub: skin.priceRub,
          sellPriceRub,
          status: 'owned',
          source: 'purchase',
          metadata: metadata as Prisma.InputJsonValue,
        },
        include: { skin: { select: this.publicSkinSelect } },
      });

      await tx.inventoryTransaction.create({
        data: {
          userId,
          inventoryItemId: item.id,
          type: 'purchase',
          amountRub: skin.priceRub,
          metadata: { skinId: skin.id },
        },
      });

      return { item, wallet: updatedWallet };
    });
  }

  async sellInventoryItem(userId: number, dto: SellInventoryItemDto) {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.inventoryItem.updateMany({
        where: { id: dto.inventoryItemId, userId, status: 'owned' },
        data: { status: 'sold' },
      });

      if (claim.count === 0) {
        throw new BadRequestException('Inventory item not found or not owned');
      }

      const updatedItem = await tx.inventoryItem.findUnique({
        where: { id: dto.inventoryItemId },
        include: { skin: { select: this.publicSkinSelect } },
      });

      if (!updatedItem) {
        throw new NotFoundException('Inventory item not found after sale');
      }

      const wallet = await tx.wallet.upsert({
        where: { userId },
        update: { balance: { increment: updatedItem.sellPriceRub } },
        create: {
          userId,
          balance: updatedItem.sellPriceRub,
          currency: 'RUB',
        },
      });

      await tx.inventoryTransaction.create({
        data: {
          userId,
          inventoryItemId: updatedItem.id,
          type: 'sell',
          amountRub: updatedItem.sellPriceRub,
          metadata: { skinId: updatedItem.skinId },
        },
      });

      return { item: updatedItem, wallet };
    });
  }

  async withdrawInventoryItem(userId: number, dto: WithdrawInventoryItemDto) {
    if (!this.waxpeerWithdrawal.isConfigured()) {
      throw new BadGatewayException(
        'Withdrawals are currently unavailable. Please try again later.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        steamTradeUrl: true,
        steamTradePartner: true,
        steamTradeToken: true,
        steamTradeUrlVerifiedAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (
      !user.steamTradeUrl ||
      !user.steamTradePartner ||
      !user.steamTradeToken ||
      !user.steamTradeUrlVerifiedAt
    ) {
      throw new BadRequestException(
        'Save and verify your Steam trade URL before withdrawing.',
      );
    }

    const preItem = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.inventoryItemId },
      include: { skin: true },
    });
    if (!preItem || preItem.userId !== userId) {
      throw new BadRequestException('Inventory item not found');
    }
    if (preItem.status !== 'owned') {
      throw new BadRequestException('Item is not available for withdrawal');
    }
    if (!preItem.skin?.marketHashName) {
      throw new BadRequestException('Item is missing a market hash name');
    }
    if ((preItem.skin.provider || '').toLowerCase() !== 'waxpeer') {
      throw new BadRequestException(
        'Withdrawals are only supported for Waxpeer skins',
      );
    }

    const capResult = await this.computePriceCapWithSource({
      id: preItem.id,
      purchasePriceRub: preItem.purchasePriceRub,
      metadata: preItem.metadata,
    });
    const capThousandths = capResult.valueThousandths;
    this.logger.log(
      `Waxpeer withdrawal cap computed: userId=${userId} ` +
        `itemId=${preItem.id} skin="${preItem.skin.marketHashName}" ` +
        `purchaseRub=${preItem.purchasePriceRub.toString()} ` +
        `cap=${capThousandths ?? 'null'} source=${capResult.source}`,
    );
    if (capThousandths === null) {
      throw new BadRequestException(
        'Withdrawal cap could not be determined for this item. Please contact support.',
      );
    }

    const withdrawal = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.inventoryItem.updateMany({
        where: { id: dto.inventoryItemId, userId, status: 'owned' },
        data: { status: 'withdraw_pending' },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Item is not available for withdrawal');
      }

      const created = await tx.withdrawalRequest.create({
        data: {
          userId,
          inventoryItemId: dto.inventoryItemId,
          status: 'created',
          provider: 'waxpeer',
          providerProjectId: `withdrawal_pending_${Date.now()}_${dto.inventoryItemId}`,
          steamTradeUrl: user.steamTradeUrl!,
        },
      });

      const finalProjectId = `withdrawal_${created.id}`;
      const withProjectId = await tx.withdrawalRequest.update({
        where: { id: created.id },
        data: { providerProjectId: finalProjectId },
      });

      await tx.inventoryTransaction.create({
        data: {
          userId,
          inventoryItemId: dto.inventoryItemId,
          type: 'withdraw_request',
          amountRub: preItem.purchasePriceRub,
          metadata: {
            withdrawalId: created.id,
            providerProjectId: finalProjectId,
            marketHashName: preItem.skin.marketHashName,
          },
        },
      });

      return withProjectId;
    });

    let listing: WaxpeerListing | null = null;
    try {
      listing = await this.waxpeerWithdrawal.findCheapestListing(
        preItem.skin.marketHashName,
      );
    } catch (error) {
      await this.failWithdrawalAndRestore(
        withdrawal.id,
        dto.inventoryItemId,
        userId,
        `Waxpeer listing lookup failed: ${(error as Error).message}`,
      );
      throw new BadGatewayException(
        'Withdrawal provider is unavailable. Your item was restored.',
      );
    }

    if (!listing) {
      this.logger.warn(
        `Waxpeer withdrawal listing missing: userId=${userId} ` +
          `itemId=${preItem.id} skin="${preItem.skin.marketHashName}" ` +
          `cap=${capThousandths}`,
      );
      await this.failWithdrawalAndRestore(
        withdrawal.id,
        dto.inventoryItemId,
        userId,
        'No matching Waxpeer listing',
      );
      throw new BadRequestException(
        "No eligible Waxpeer listing is available at or below the item's purchase price.",
      );
    }

    const overByThousandths = listing.priceThousandths - capThousandths;
    const eligible = listing.priceThousandths <= capThousandths;
    this.logger.log(
      `Waxpeer withdrawal listing checked: userId=${userId} ` +
        `itemId=${preItem.id} skin="${preItem.skin.marketHashName}" ` +
        `listingId=${listing.itemId} price=${listing.priceThousandths} ` +
        `cap=${capThousandths} overBy=${overByThousandths} eligible=${eligible}`,
    );

    if (listing.priceThousandths > capThousandths) {
      this.logger.warn(
        `Waxpeer withdrawal listing rejected: userId=${userId} ` +
          `itemId=${preItem.id} skin="${preItem.skin.marketHashName}" ` +
          `listingId=${listing.itemId} price=${listing.priceThousandths} ` +
          `cap=${capThousandths} overBy=${overByThousandths}`,
      );
      await this.failWithdrawalAndRestore(
        withdrawal.id,
        dto.inventoryItemId,
        userId,
        `Listing price ${listing.priceThousandths} exceeds cap ${capThousandths}`,
      );
      throw new BadRequestException(
        "No eligible Waxpeer listing is available at or below the item's purchase price.",
      );
    }

    await this.prisma.withdrawalRequest.update({
      where: { id: withdrawal.id },
      data: {
        providerListingId: listing.itemId,
        providerPrice: listing.priceThousandths,
        status: 'provider_purchase_pending',
      },
    });

    let buy;
    try {
      buy = await this.waxpeerWithdrawal.buyOneP2p({
        projectId: withdrawal.providerProjectId,
        itemId: listing.itemId,
        priceThousandths: listing.priceThousandths,
        partner: user.steamTradePartner,
        token: user.steamTradeToken,
      });
    } catch (error) {
      await this.markPendingForRecovery(
        withdrawal.id,
        `Waxpeer buy network error: ${(error as Error).message}`,
      );
      throw new BadGatewayException(
        'Withdrawal is pending verification. We will confirm with the provider shortly; ' +
          'if it cannot be confirmed, the item will be marked for review.',
      );
    }

    if (!buy.success && !buy.duplicateProjectId) {
      await this.failWithdrawalAndRestore(
        withdrawal.id,
        dto.inventoryItemId,
        userId,
        buy.message || 'Waxpeer buy rejected',
        buy.raw,
      );
      throw new BadRequestException(
        buy.message || 'Withdrawal was rejected by the provider.',
      );
    }

    await this.prisma.withdrawalRequest.update({
      where: { id: withdrawal.id },
      data: {
        status: 'provider_purchase_pending',
        providerTradeId: buy.id,
        providerRawData: buy.raw as Prisma.InputJsonValue,
        lastCheckedAt: new Date(),
      },
    });

    await this.prisma.inventoryTransaction.create({
      data: {
        userId,
        inventoryItemId: dto.inventoryItemId,
        type: 'withdraw_provider_buy',
        amountRub: preItem.purchasePriceRub,
        metadata: {
          withdrawalId: withdrawal.id,
          providerTradeId: buy.id ?? null,
          providerListingId: listing.itemId,
          providerPrice: listing.priceThousandths,
          duplicateProjectId: buy.duplicateProjectId,
        },
      },
    });

    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.inventoryItemId },
      include: { skin: { select: this.publicSkinSelect } },
    });

    return {
      item,
      withdrawal: {
        id: withdrawal.id,
        status: 'provider_purchase_pending',
        provider: 'waxpeer',
      },
    };
  }

  private async failWithdrawalAndRestore(
    withdrawalId: number,
    inventoryItemId: number,
    userId: number,
    errorMessage: string,
    raw?: unknown,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.withdrawalRequest.update({
          where: { id: withdrawalId },
          data: {
            status: 'failed',
            errorMessage,
            failedAt: new Date(),
            providerRawData:
              raw !== undefined
                ? (raw as Prisma.InputJsonValue)
                : undefined,
          },
        });
        await tx.inventoryItem.updateMany({
          where: { id: inventoryItemId, status: 'withdraw_pending' },
          data: { status: 'owned' },
        });
        await tx.inventoryTransaction.create({
          data: {
            userId,
            inventoryItemId,
            type: 'withdraw_fail',
            amountRub: new Prisma.Decimal(0),
            metadata: { withdrawalId, errorMessage },
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to roll back withdrawal ${withdrawalId}: ${(error as Error).message}`,
      );
    }
  }

  private async markPendingForRecovery(
    withdrawalId: number,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: 'provider_purchase_pending',
        errorMessage,
        lastCheckedAt: new Date(),
      },
    });
  }

  private async computePriceCapWithSource(item: {
    id?: number;
    purchasePriceRub: Prisma.Decimal;
    metadata: Prisma.JsonValue | null;
  }): Promise<{
    valueThousandths: number | null;
    source: 'metadata' | 'derived' | 'unavailable';
  }> {
    const stored = this.readStoredCapFromMetadata(item.metadata);
    if (stored !== null) {
      return { valueThousandths: stored, source: 'metadata' };
    }

    const derived = await this.derivePriceCapThousandths(item.purchasePriceRub);
    if (derived !== null) {
      this.logger.warn(
        `Withdrawal cap fallback used for inventory item ${item.id ?? '<unknown>'}: ` +
          `no stored providerPriceUsdThousandthsAtPurchase, derived ${derived} from current FX/markup`,
      );
      return { valueThousandths: derived, source: 'derived' };
    }
    return { valueThousandths: null, source: 'unavailable' };
  }

  private async derivePriceCapThousandths(
    priceRub: Prisma.Decimal,
  ): Promise<number | null> {
    try {
      const rate = await this.fxRateService.getUsdToRubRate();
      if (!Number.isFinite(rate) || rate <= 0) {
        return null;
      }
      const markupMultiplier = new Prisma.Decimal(1).plus(
        this.markupPercent.div(100),
      );
      if (markupMultiplier.lte(0)) {
        return null;
      }
      const fx = new Prisma.Decimal(rate.toString());
      const usd = priceRub.div(fx).div(markupMultiplier);
      const thousandths = usd.mul(1000).toDecimalPlaces(0).toNumber();
      if (!Number.isFinite(thousandths) || thousandths <= 0) {
        return null;
      }
      return thousandths;
    } catch (error) {
      this.logger.warn(
        `Failed to derive withdrawal cap: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private readStoredCapFromMetadata(
    metadata: Prisma.JsonValue | null,
  ): number | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }
    const raw = (metadata as Record<string, unknown>)[
      'providerPriceUsdThousandthsAtPurchase'
    ];
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      return Math.round(raw);
    }
    if (typeof raw === 'string') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.round(parsed);
      }
    }
    return null;
  }
}
