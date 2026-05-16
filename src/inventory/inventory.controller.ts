import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import { BuySkinDto } from './dto/buy-skin.dto';
import { ListSkinsDto } from './dto/list-skins.dto';
import { SellInventoryItemDto } from './dto/sell-inventory-item.dto';
import { InventoryService } from './inventory.service';

@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('skins')
  getSkins(@Query() query: ListSkinsDto) {
    return this.inventoryService.getSkins(query);
  }

  @Get('skins/:id')
  getSkin(@Param('id', ParseIntPipe) id: number) {
    return this.inventoryService.getSkin(id);
  }

  @Get('inventory')
  @UseGuards(AuthenticatedGuard)
  getInventory(@Req() req: Request) {
    const user = req.user as { id: number };
    return this.inventoryService.getInventory(user.id);
  }

  @Post('inventory/buy')
  @UseGuards(AuthenticatedGuard)
  buySkin(@Req() req: Request, @Body() dto: BuySkinDto) {
    const user = req.user as { id: number };
    return this.inventoryService.buySkin(user.id, dto);
  }

  @Post('inventory/sell')
  @UseGuards(AuthenticatedGuard)
  sellInventoryItem(@Req() req: Request, @Body() dto: SellInventoryItemDto) {
    const user = req.user as { id: number };
    return this.inventoryService.sellInventoryItem(user.id, dto);
  }
}
