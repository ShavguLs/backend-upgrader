import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SteamProfile } from './steam.strategy';

@Injectable()
export class AuthService {
  private readonly devUserSteamId = 'local-test-user';

  constructor(private prisma: PrismaService) {}

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
