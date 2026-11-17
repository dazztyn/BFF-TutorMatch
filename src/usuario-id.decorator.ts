import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { verificarToken } from './jwt';

// Id del usuario actual, sacado del JWT de la cabecera "Authorization: Bearer <token>".
export const UsuarioId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const cabecera: unknown =
      GqlExecutionContext.create(ctx).getContext().req.headers.authorization;
    const token =
      typeof cabecera === 'string' && /^Bearer (\S+)$/.exec(cabecera)?.[1];
    if (!token) {
      throw new UnauthorizedException(
        'Falta la cabecera Authorization: Bearer <token>',
      );
    }
    return verificarToken(token);
  },
);
