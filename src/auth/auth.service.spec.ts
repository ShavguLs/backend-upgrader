import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { WaxpeerWithdrawalProvider } from '../skins/providers/waxpeer-withdrawal.provider';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let waxpeer: { isConfigured: jest.Mock; checkTradeLink: jest.Mock };

  beforeEach(async () => {
    waxpeer = {
      isConfigured: jest.fn().mockReturnValue(false),
      checkTradeLink: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              upsert: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        { provide: WaxpeerWithdrawalProvider, useValue: waxpeer },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should upsert user by steamId', async () => {
    const profile = {
      provider: 'steam',
      id: '123456789',
      displayName: 'TestUser',
      photos: [
        { value: 'small.jpg' },
        { value: 'medium.jpg' },
        { value: 'large.jpg' },
      ],
      _json: {
        profileurl: 'https://steamcommunity.com/id/testuser',
      },
    };

    const expectedUser = {
      id: 1,
      steamId: profile.id,
      displayName: profile.displayName,
      avatar: profile.photos[2].value,
      profileUrl: profile._json.profileurl,
    };

    (prisma.user.upsert as jest.Mock).mockResolvedValue(expectedUser);

    const result = await service.validateUser(profile);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { steamId: profile.id },
      update: {
        displayName: profile.displayName,
        avatar: profile.photos[2].value,
        profileUrl: profile._json.profileurl,
      },
      create: {
        steamId: profile.id,
        displayName: profile.displayName,
        avatar: profile.photos[2].value,
        profileUrl: profile._json.profileurl,
        wallet: {
          create: {
            balance: 0,
            currency: 'RUB',
          },
        },
      },
    });

    expect(result).toEqual(expectedUser);
  });

  it('should upsert the local development user with a funded wallet', async () => {
    const expectedUser = {
      id: 1,
      steamId: 'local-test-user',
      displayName: 'Local Test User',
    };

    (prisma.user.upsert as jest.Mock).mockResolvedValue(expectedUser);

    const result = await service.getOrCreateDevUser();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { steamId: 'local-test-user' },
      update: {
        displayName: 'Local Test User',
        profileUrl: 'http://localhost/local-test-user',
        avatar: 'http://localhost/local-test-user-avatar.png',
        wallet: {
          upsert: {
            update: {
              balance: expect.any(Object),
              currency: 'RUB',
            },
            create: {
              balance: expect.any(Object),
              currency: 'RUB',
            },
          },
        },
      },
      create: {
        steamId: 'local-test-user',
        displayName: 'Local Test User',
        profileUrl: 'http://localhost/local-test-user',
        avatar: 'http://localhost/local-test-user-avatar.png',
        wallet: {
          create: {
            balance: expect.any(Object),
            currency: 'RUB',
          },
        },
      },
    });
    expect(result).toEqual(expectedUser);
  });

  describe('updateTradeUrl', () => {
    it('rejects invalid URL', async () => {
      await expect(
        service.updateTradeUrl(1, 'not-a-url'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects URL without partner/token', async () => {
      await expect(
        service.updateTradeUrl(
          1,
          'https://steamcommunity.com/tradeoffer/new/',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when provider unconfigured and ALLOW_UNVERIFIED_TRADE_URL is not set', async () => {
      const previous = process.env.ALLOW_UNVERIFIED_TRADE_URL;
      delete process.env.ALLOW_UNVERIFIED_TRADE_URL;
      try {
        const url =
          'https://steamcommunity.com/tradeoffer/new/?partner=900&token=ABcd_-';
        await expect(service.updateTradeUrl(1, url)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.user.update).not.toHaveBeenCalled();
      } finally {
        if (previous === undefined) {
          delete process.env.ALLOW_UNVERIFIED_TRADE_URL;
        } else {
          process.env.ALLOW_UNVERIFIED_TRADE_URL = previous;
        }
      }
    });

    it('saves verified trade URL when provider unconfigured and ALLOW_UNVERIFIED_TRADE_URL=true', async () => {
      const previous = process.env.ALLOW_UNVERIFIED_TRADE_URL;
      process.env.ALLOW_UNVERIFIED_TRADE_URL = 'true';
      try {
        const url =
          'https://steamcommunity.com/tradeoffer/new/?partner=900&token=ABcd_-';
        (prisma.user.update as jest.Mock).mockResolvedValue({
          id: 1,
          steamTradeUrl: url,
          steamTradePartner: '900',
          steamTradeToken: 'ABcd_-',
          steamTradeUrlVerifiedAt: new Date(),
        });

        const result = await service.updateTradeUrl(1, url);
        expect(result.steamTradeUrl).toBe(url);
        expect(prisma.user.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 1 },
            data: expect.objectContaining({
              steamTradeUrl: url,
              steamTradePartner: '900',
              steamTradeToken: 'ABcd_-',
            }),
          }),
        );
      } finally {
        if (previous === undefined) {
          delete process.env.ALLOW_UNVERIFIED_TRADE_URL;
        } else {
          process.env.ALLOW_UNVERIFIED_TRADE_URL = previous;
        }
      }
    });

    it('validates with Waxpeer when configured', async () => {
      waxpeer.isConfigured.mockReturnValue(true);
      waxpeer.checkTradeLink.mockResolvedValue({
        success: true,
        partner: '900',
        token: 'ABcd',
      });
      (prisma.user.update as jest.Mock).mockResolvedValue({
        id: 1,
        steamTradeUrl: 'x',
        steamTradePartner: '900',
        steamTradeToken: 'ABcd',
        steamTradeUrlVerifiedAt: new Date(),
      });

      const url =
        'https://steamcommunity.com/tradeoffer/new/?partner=900&token=ABcd';
      await service.updateTradeUrl(1, url);
      expect(waxpeer.checkTradeLink).toHaveBeenCalledWith(url);
    });

    it('rejects when Waxpeer says invalid', async () => {
      waxpeer.isConfigured.mockReturnValue(true);
      waxpeer.checkTradeLink.mockResolvedValue({
        success: false,
        message: 'Invalid',
      });
      const url =
        'https://steamcommunity.com/tradeoffer/new/?partner=900&token=ABcd';
      await expect(service.updateTradeUrl(1, url)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
