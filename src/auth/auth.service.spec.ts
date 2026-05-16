import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              upsert: jest.fn(),
            },
          },
        },
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
      },
    });

    expect(result).toEqual(expectedUser);
  });
});
