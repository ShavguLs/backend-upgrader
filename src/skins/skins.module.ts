import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FxRateService } from './fx-rate.service';
import { SkinSyncService } from './skin-sync.service';
import { WaxpeerProvider } from './providers/waxpeer.provider';

@Module({
  imports: [PrismaModule],
  providers: [FxRateService, WaxpeerProvider, SkinSyncService],
  exports: [SkinSyncService],
})
export class SkinsModule {}
