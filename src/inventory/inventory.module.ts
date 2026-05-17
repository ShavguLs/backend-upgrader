import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SkinsModule } from '../skins/skins.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { WithdrawalPollerService } from './withdrawal-poller.service';

@Module({
  imports: [PrismaModule, SkinsModule],
  controllers: [InventoryController],
  providers: [InventoryService, WithdrawalPollerService],
})
export class InventoryModule {}
