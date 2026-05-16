import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-steam';
import { AuthService } from './auth.service';

export interface SteamProfile {
  provider: string;
  id: string;
  displayName: string;
  photos?: Array<{ value: string }>;
  _json?: {
    profileurl?: string;
    [key: string]: any;
  };
}

@Injectable()
export class SteamStrategy extends PassportStrategy(Strategy, 'steam') {
  constructor(private readonly authService: AuthService) {
    const returnURL = process.env.STEAM_RETURN_URL;
    const realm = process.env.STEAM_REALM;
    const apiKey = process.env.STEAM_API_KEY;

    if (!returnURL || !realm || !apiKey) {
      throw new Error(
        'STEAM_RETURN_URL, STEAM_REALM, and STEAM_API_KEY are required',
      );
    }

    super({ returnURL, realm, apiKey });
  }

  async validate(identifier: string, profile: SteamProfile) {
    return this.authService.validateUser(profile);
  }
}
