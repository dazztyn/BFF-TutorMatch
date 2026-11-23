import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { firmarToken } from './jwt';
import { TokenGuard } from './token.guard';

const contexto = (authorization?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  }) as unknown as ExecutionContext;

describe('TokenGuard', () => {
  const guard = new TokenGuard();

  it('deja pasar un token válido', () => {
    expect(guard.canActivate(contexto(`Bearer ${firmarToken('u-1')}`))).toBe(
      true,
    );
  });

  it('rechaza con 401 sin token o con uno inválido', () => {
    expect(() => guard.canActivate(contexto())).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(contexto('Bearer basura'))).toThrow(
      UnauthorizedException,
    );
  });
});
