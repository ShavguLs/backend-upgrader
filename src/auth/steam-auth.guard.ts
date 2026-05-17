import {
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

@Injectable()
export class SteamAuthGuard extends AuthGuard('steam') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const canActivate = (await super.canActivate(context)) as boolean;
    if (!canActivate) {
      return false;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    await new Promise<void>((resolve, reject) => {
      request.session.regenerate((err: Error | null) => {
        if (err) {
          reject(
            new InternalServerErrorException('Session regeneration failed'),
          );
          return;
        }

        resolve();
      });
    });

    request.user = user;
    await super.logIn(request);

    return true;
  }
}
