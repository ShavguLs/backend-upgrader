/* eslint-disable */
import { ExecutionContext } from '@nestjs/common';
import { SteamAuthGuard } from './steam-auth.guard';
import type { Request } from 'express';

describe('SteamAuthGuard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should log the authenticated Steam user into the session', async () => {
    const guard = new SteamAuthGuard();
    const request = { user: { id: 1 } } as unknown as Request;
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
    const baseGuardPrototype = Object.getPrototypeOf(SteamAuthGuard.prototype);
    const canActivateSpy = jest
      .spyOn(baseGuardPrototype, 'canActivate')
      .mockResolvedValue(true);
    const logInSpy = jest
      .spyOn(baseGuardPrototype, 'logIn')
      .mockResolvedValue(undefined);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(canActivateSpy).toHaveBeenCalledWith(context);
    expect(logInSpy).toHaveBeenCalledWith(request);
  });
});
