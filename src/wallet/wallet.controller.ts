import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import type { PlisioCallbackPayload } from './plisio-callback.types';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import type { Request } from 'express';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @UseGuards(AuthenticatedGuard)
  async getWallet(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.walletService.getWallet(user.id);
  }

  @Post('deposits')
  @UseGuards(AuthenticatedGuard)
  async createDeposit(@Req() req: Request, @Body() dto: CreateDepositDto) {
    const user = req.user as { id: number };
    return this.walletService.createDeposit(user.id, dto);
  }

  @Post('plisio/callback')
  @HttpCode(HttpStatus.OK)
  async handlePlisioCallback(@Body() payload: PlisioCallbackPayload) {
    return this.walletService.handleCallback(payload);
  }
}
