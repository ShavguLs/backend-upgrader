import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedGuard } from './authenticated.guard';
import { SteamAuthGuard } from './steam-auth.guard';
import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import { AuthService, toPublicUser } from './auth.service';
import { UpdateTradeUrlDto } from './dto/update-trade-url.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('steam')
  @UseGuards(AuthGuard('steam'))
  async steamAuth() {
    // Initiates the Steam OpenID login flow
  }

  @Get('steam/return')
  @UseGuards(SteamAuthGuard)
  steamAuthReturn(@Res() res: Response) {
    return res.redirect(process.env.FRONTEND_URL || 'http://localhost:3001');
  }

  @Get('me')
  @UseGuards(AuthenticatedGuard)
  getMe(@Req() req: Request) {
    return toPublicUser(req.user as User);
  }

  @Put('me/trade-url')
  @UseGuards(AuthenticatedGuard)
  updateTradeUrl(@Req() req: Request, @Body() dto: UpdateTradeUrlDto) {
    const user = req.user as { id: number };
    return this.authService.updateTradeUrl(user.id, dto.steamTradeUrl);
  }

  @Post('dev-login')
  async devLogin(@Req() req: Request) {
    if (process.env.ENABLE_DEV_LOGIN !== 'true') {
      throw new NotFoundException();
    }

    // Temporary local-only login for testing protected flows without Steam.
    const user = await this.authService.getOrCreateDevUser();

    return new Promise<{ user: ReturnType<typeof toPublicUser> }>(
      (resolve, reject) => {
        req.session.regenerate((err: Error | null) => {
          if (err) {
            reject(
              new InternalServerErrorException('Session regeneration failed'),
            );
            return;
          }

          req.login(user, (err: Error | null) => {
            if (err) {
              reject(new InternalServerErrorException('Error logging in'));
              return;
            }

            resolve({ user: toPublicUser(user) });
          });
        });
      },
    );
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return new Promise<{ message: string }>((resolve, reject) => {
      req.logout((err: Error | null) => {
        if (err) {
          reject(new InternalServerErrorException('Error logging out'));
          return;
        }
        req.session.destroy((err: Error | null) => {
          if (err) {
            reject(
              new InternalServerErrorException('Error destroying session'),
            );
            return;
          }
          res.clearCookie('connect.sid');
          resolve({ message: 'Logged out successfully' });
        });
      });
    });
  }
}
