import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function createContext(user?: { role?: string }): ExecutionContext {
  return {
    getHandler: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const build = (requiredRoles?: string[]) => {
    const reflector = {
      get: jest.fn().mockReturnValue(requiredRoles),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  };

  it('allows access when no roles are required', () => {
    expect(build(undefined).canActivate(createContext({ role: 'WAITER' }))).toBe(
      true,
    );
  });

  it('denies access when the user has no role', () => {
    expect(() => build(['MANAGER']).canActivate(createContext(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('denies access when the role does not match', () => {
    expect(() =>
      build(['MANAGER']).canActivate(createContext({ role: 'WAITER' })),
    ).toThrow(ForbiddenException);
  });

  it('allows access when the role matches', () => {
    expect(
      build(['MANAGER', 'ADMINISTRATOR']).canActivate(
        createContext({ role: 'MANAGER' }),
      ),
    ).toBe(true);
  });
});
