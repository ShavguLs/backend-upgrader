import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BuySkinDto } from './dto/buy-skin.dto';
import { ListSkinsDto } from './dto/list-skins.dto';
import { SellInventoryItemDto } from './dto/sell-inventory-item.dto';

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

  constructor(private readonly prisma: PrismaService) {}

  async getSkins(query: ListSkinsDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;
    const where: Prisma.SkinWhereInput = {
      isActive: true,
    };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { marketHashName: { contains: query.search, mode: 'insensitive' } },
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
      where: { userId, status: 'owned' },
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

      const item = await tx.inventoryItem.create({
        data: {
          userId,
          skinId: skin.id,
          purchasePriceRub: skin.priceRub,
          sellPriceRub,
          status: 'owned',
          source: 'purchase',
          metadata: {
            skinMarketHashName: skin.marketHashName,
            skinPriceRub: skin.priceRub.toString(),
          },
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
}
