import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SteamProfile } from './steam.strategy';
import { WaxpeerWithdrawalProvider } from '../skins/providers/waxpeer-withdrawal.provider';

export type PublicUser = {
  id: number;
  steamId: string;
  displayName: string;
  avatar: string | null;
  profileUrl: string | null;
  steamTradeUrl: string | null;
  steamTradeUrlVerifiedAt: Date | null;
};

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    steamId: user.steamId,
    displayName: user.displayName,
    avatar: user.avatar,
    profileUrl: user.profileUrl,
    steamTradeUrl: user.steamTradeUrl,
    steamTradeUrlVerifiedAt: user.steamTradeUrlVerifiedAt,
  };
}

export function parseSteamTradeUrl(
  tradeUrl: string,
): { partner: string; token: string } | null {
  try {
    const url = new URL(tradeUrl);
    if (url.hostname !== 'steamcommunity.com') {
      return null;
    }
    if (!url.pathname.startsWith('/tradeoffer/new')) {
      return null;
    }
    const partner = url.searchParams.get('partner');
    const token = url.searchParams.get('token');
    if (!partner || !token) {
      return null;
    }
    if (!/^\d+$/.test(partner)) {
      return null;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(token)) {
      return null;
    }
    return { partner, token };
  } catch {
    return null;
  }
}

@Injectable()
export class AuthService {
  private readonly devUserSteamId = 'local-test-user';

  constructor(
    private prisma: PrismaService,
    private readonly waxpeerWithdrawal: WaxpeerWithdrawalProvider,
  ) {}

  async validateUser(profile: SteamProfile) {
    const steamId = profile.id;
    const displayName = profile.displayName;
    const avatar =
      profile.photos?.[2]?.value ??
      profile.photos?.[1]?.value ??
      profile.photos?.[0]?.value ??
      null;
    const profileUrl = profile._json ? profile._json.profileurl : null;

    const user = await this.prisma.user.upsert({
      where: { steamId },
      update: {
        displayName,
        avatar,
        profileUrl,
      },
      create: {
        steamId,
        displayName,
        avatar,
        profileUrl,
        wallet: {
          create: {
            balance: 0,
            currency: 'RUB',
          },
        },
      },
    });

    return user;
  }

  async updateTradeUrl(userId: number, rawTradeUrl: string) {
    const tradeUrl = rawTradeUrl.trim();
    const parsed = parseSteamTradeUrl(tradeUrl);
    if (!parsed) {
      throw new BadRequestException(
        'Invalid Steam trade URL. Expected https://steamcommunity.com/tradeoffer/new/?partner=...&token=...',
      );
    }

    let partner = parsed.partner;
    let token = parsed.token;

    if (this.waxpeerWithdrawal.isConfigured()) {
      try {
        const remote = await this.waxpeerWithdrawal.checkTradeLink(tradeUrl);
        if (!remote.success) {
          throw new BadRequestException(
            remote.message ||
              'Steam trade URL was rejected by the withdrawal provider.',
          );
        }
        if (remote.partner) partner = remote.partner;
        if (remote.token) token = remote.token;
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException(
          `Steam trade URL validation failed: ${(error as Error).message}`,
        );
      }
    } else if (process.env.ALLOW_UNVERIFIED_TRADE_URL !== 'true') {
      throw new BadRequestException(
        'Steam trade URL cannot be verified: withdrawal provider is not configured.',
      );
    }

    const verifiedAt = new Date();
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        steamTradeUrl: tradeUrl,
        steamTradePartner: partner,
        steamTradeToken: token,
        steamTradeUrlVerifiedAt: verifiedAt,
      },
      select: {
        id: true,
        steamTradeUrl: true,
        steamTradeUrlVerifiedAt: true,
      },
    });

    return user;
  }

  async getOrCreateDevUser() {
    return this.prisma.user.upsert({
      where: { steamId: this.devUserSteamId },
      update: {
        displayName: 'Local Test User',
        profileUrl: 'http://localhost/local-test-user',
        avatar: 'http://localhost/local-test-user-avatar.png',
        wallet: {
          upsert: {
            update: {
              balance: new Prisma.Decimal('10000.00'),
              currency: 'RUB',
            },
            create: {
              balance: new Prisma.Decimal('10000.00'),
              currency: 'RUB',
            },
          },
        },
      },
      create: {
        steamId: this.devUserSteamId,
        displayName: 'Local Test User',
        profileUrl: 'http://localhost/local-test-user',
        avatar: 'http://localhost/local-test-user-avatar.png',
        wallet: {
          create: {
            balance: new Prisma.Decimal('10000.00'),
            currency: 'RUB',
          },
        },
      },
    });
  }
}
