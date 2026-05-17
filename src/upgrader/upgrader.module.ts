import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UpgraderController } from './upgrader.controller';
import { UpgraderService } from './upgrader.service';

@Module({
  imports: [PrismaModule],
  controllers: [UpgraderController],
  providers: [UpgraderService],
})
export class UpgraderModule {}
