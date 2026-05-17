/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthenticatedGuard } from './authenticated.guard';
import type { Request, Response } from 'express';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Pick<AuthService, 'getOrCreateDevUser'>;
  const originalEnableDevLogin = process.env.ENABLE_DEV_LOGIN;

  beforeEach(async () => {
    authService = {
      getOrCreateDevUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    })
      .overrideGuard(AuthenticatedGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    process.env.ENABLE_DEV_LOGIN = originalEnableDevLogin;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('steamAuthReturn', () => {
    it('should redirect to the frontend', () => {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const res = {
        redirect: jest.fn().mockImplementation((url) => url),
      } as unknown as Response;

      const result = controller.steamAuthReturn(res);
      expect(result).toBe(frontendUrl);
      expect(res.redirect).toHaveBeenCalledWith(frontendUrl);
    });
  });

  describe('getMe', () => {
    it('should return the user if present', () => {
      const req = {
        user: { id: 2, displayName: 'AnotherUser' },
      } as unknown as Request;
      const result = controller.getMe(req);
      expect(result).toEqual({ id: 2, displayName: 'AnotherUser' });
    });
  });

  describe('devLogin', () => {
    it('should create a dev user and log in through the request', async () => {
      process.env.ENABLE_DEV_LOGIN = 'true';
      const user = {
        id: 1,
        email: null,
        steamId: 'local-test-user',
        displayName: 'Local Test User',
        avatar: 'http://localhost/local-test-user-avatar.png',
        profileUrl: 'http://localhost/local-test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      jest.mocked(authService.getOrCreateDevUser).mockResolvedValue(user);
      const req = {
        session: {
          regenerate: jest.fn((cb) => cb(null)),
        },
        login: jest.fn((loginUser, cb) => cb(null)),
      } as unknown as Request;

      const result = await controller.devLogin(req);

      expect(authService.getOrCreateDevUser).toHaveBeenCalled();
      expect(req.session.regenerate).toHaveBeenCalledWith(expect.any(Function));
      expect(req.login).toHaveBeenCalledWith(user, expect.any(Function));
      expect(result).toEqual({ user });
    });

    it('should reject dev login unless explicitly enabled', async () => {
      delete process.env.ENABLE_DEV_LOGIN;
      const req = {
        login: jest.fn(),
      } as unknown as Request;

      await expect(controller.devLogin(req)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(authService.getOrCreateDevUser).not.toHaveBeenCalled();
      expect(req.login).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should call req.logout and req.session.destroy', async () => {
      const req = {
        logout: jest.fn((cb) => cb(null)),
        session: {
          destroy: jest.fn((cb) => cb(null)),
        },
      } as unknown as Request;
      const res = {
        clearCookie: jest.fn(),
      } as unknown as Response;

      const result = await controller.logout(req, res);

      expect(req.logout).toHaveBeenCalled();
      expect(req.session.destroy).toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('connect.sid');
      expect(result).toEqual({
        message: 'Logged out successfully',
      });
    });
  });
});
