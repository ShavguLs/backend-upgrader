/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthenticatedGuard } from './authenticated.guard';
import type { Request, Response } from 'express';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
    })
      .overrideGuard(AuthenticatedGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('steamAuthReturn', () => {
    it('should return the user from the request', () => {
      const req = {
        user: { id: 1, displayName: 'TestUser' },
      } as unknown as Request;
      const res = {
        json: jest.fn().mockImplementation((val) => val),
      } as unknown as Response;

      const result = controller.steamAuthReturn(req, res);
      expect(result).toEqual({ id: 1, displayName: 'TestUser' });
      expect(res.json).toHaveBeenCalledWith(req.user);
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
      // @ts-expect-error Mocking session for tests
      expect(req.session.destroy).toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith('connect.sid');
      expect(result).toEqual({
        message: 'Logged out successfully',
      });
    });
  });
});
