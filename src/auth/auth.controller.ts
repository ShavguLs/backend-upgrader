import {
  Controller,
  Get,
  Post,
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
import { AuthService } from './auth.service';

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
  steamAuthReturn(@Req() req: Request, @Res() res: Response) {
    // Successfully authenticated, user is in req.user
    // Usually we would redirect to a frontend here.
    // As per plan: "Returns the logged-in user as JSON because there is no frontend yet."
    return res.json(req.user);
  }

  @Get('me')
  @UseGuards(AuthenticatedGuard)
  getMe(@Req() req: Request) {
    return req.user;
  }

  @Post('dev-login')
  async devLogin(@Req() req: Request) {
    if (process.env.ENABLE_DEV_LOGIN !== 'true') {
      throw new NotFoundException();
    }

    // Temporary local-only login for testing protected flows without Steam.
    const user = await this.authService.getOrCreateDevUser();

    return new Promise<{ user: typeof user }>((resolve, reject) => {
      req.login(user, (err: Error | null) => {
        if (err) {
          reject(new InternalServerErrorException('Error logging in'));
          return;
        }

        resolve({ user });
      });
    });
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
