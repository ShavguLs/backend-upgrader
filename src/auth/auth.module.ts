import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SteamStrategy } from './steam.strategy';
import { SessionSerializer } from './session.serializer';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PassportModule.register({ session: true }), PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, SteamStrategy, SessionSerializer],
})
export class AuthModule {}
