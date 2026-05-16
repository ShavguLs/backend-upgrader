import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedGuard } from './authenticated.guard';

describe('AuthenticatedGuard', () => {
  let guard: AuthenticatedGuard;

  beforeEach(() => {
    guard = new AuthenticatedGuard();
  });

  it('should return true if request is authenticated', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          isAuthenticated: () => true,
        }),
      }),
    } as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw UnauthorizedException if request is not authenticated', () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          isAuthenticated: () => false,
        }),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
