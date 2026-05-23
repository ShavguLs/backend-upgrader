import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import { CreateUpgradeAttemptDto } from './dto/create-upgrade-attempt.dto';
import { ListUpgradeDropsDto } from './dto/list-upgrade-drops.dto';
import { ListUpgradeHistoryDto } from './dto/list-upgrade-history.dto';
import { ListUpgradeOptionsDto } from './dto/list-upgrade-options.dto';
import { UpgraderService } from './upgrader.service';

@Controller('upgrader')
export class UpgraderController {
  constructor(private readonly upgraderService: UpgraderService) {}

  @Get('drops')
  listDrops(@Query() query: ListUpgradeDropsDto) {
    return this.upgraderService.listDrops(query);
  }

  @Get('options')
  @UseGuards(AuthenticatedGuard)
  listOptions(@Req() req: Request, @Query() query: ListUpgradeOptionsDto) {
    const user = req.user as { id: number };
    return this.upgraderService.listOptions(user.id, query);
  }

  @Post('attempt')
  @UseGuards(AuthenticatedGuard)
  createAttempt(@Req() req: Request, @Body() dto: CreateUpgradeAttemptDto) {
    const user = req.user as { id: number };
    return this.upgraderService.createAttempt(user.id, dto);
  }

  @Get('history')
  @UseGuards(AuthenticatedGuard)
  listHistory(@Req() req: Request, @Query() query: ListUpgradeHistoryDto) {
    const user = req.user as { id: number };
    return this.upgraderService.listHistory(user.id, query);
  }

  @Get('top-drop')
  @UseGuards(AuthenticatedGuard)
  listTopDrop(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.upgraderService.listTopDrop(user.id);
  }
}
