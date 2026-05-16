import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private prisma: PrismaService) {
    super();
  }

  serializeUser(
    user: User,
    done: (err: Error | null, id?: number) => void,
  ): void {
    done(null, user.id);
  }

  async deserializeUser(
    id: number,
    done: (err: Error | null, payload?: any) => void,
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id } });
      if (!user) {
        return done(null, false);
      }
      done(null, user);
    } catch (err) {
      done(err as Error, null);
    }
  }
}
