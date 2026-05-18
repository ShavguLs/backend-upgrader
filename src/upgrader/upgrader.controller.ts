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
import { ListUpgradeHistoryDto } from './dto/list-upgrade-history.dto';
import { ListUpgradeOptionsDto } from './dto/list-upgrade-options.dto';
import { UpgraderService } from './upgrader.service';

@Controller('upgrader')
@UseGuards(AuthenticatedGuard)
export class UpgraderController {
  constructor(private readonly upgraderService: UpgraderService) {}

  @Get('options')
  listOptions(@Req() req: Request, @Query() query: ListUpgradeOptionsDto) {
    const user = req.user as { id: number };
    return this.upgraderService.listOptions(user.id, query);
  }

  @Post('attempt')
  createAttempt(@Req() req: Request, @Body() dto: CreateUpgradeAttemptDto) {
    const user = req.user as { id: number };
    return this.upgraderService.createAttempt(user.id, dto);
  }

  @Get('history')
  listHistory(@Req() req: Request, @Query() query: ListUpgradeHistoryDto) {
    const user = req.user as { id: number };
    return this.upgraderService.listHistory(user.id, query);
  }
}
