import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FxRateService } from './fx-rate.service';
import { SkinSyncService } from './skin-sync.service';
import { WaxpeerProvider } from './providers/waxpeer.provider';
import { WaxpeerWithdrawalProvider } from './providers/waxpeer-withdrawal.provider';

@Module({
  imports: [PrismaModule],
  providers: [
    FxRateService,
    WaxpeerProvider,
    WaxpeerWithdrawalProvider,
    SkinSyncService,
  ],
  exports: [SkinSyncService, WaxpeerWithdrawalProvider, FxRateService],
})
export class SkinsModule {}
