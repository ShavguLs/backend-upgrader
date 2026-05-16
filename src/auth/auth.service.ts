import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SteamProfile } from './steam.strategy';

@Injectable()
export class AuthService {
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
      },
    });

    return user;
  }
}
