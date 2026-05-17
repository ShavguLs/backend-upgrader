import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WalletModule } from './wallet/wallet.module';
import { InventoryModule } from './inventory/inventory.module';
import { SkinsModule } from './skins/skins.module';
import { UpgraderModule } from './upgrader/upgrader.module';

@Module({
  imports: [
    HealthModule,
    PrismaModule,
    AuthModule,
    WalletModule,
    InventoryModule,
    SkinsModule,
    UpgraderModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
