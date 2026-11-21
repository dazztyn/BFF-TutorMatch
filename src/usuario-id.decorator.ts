import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { usuarioDeCabecera } from './jwt';

// Id del usuario actual, sacado del JWT de la cabecera "Authorization: Bearer <token>".
// Sirve en resolvers GraphQL y en controladores REST.
export const UsuarioId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const req =
      ctx.getType() === 'http'
        ? ctx.switchToHttp().getRequest()
        : GqlExecutionContext.create(ctx).getContext().req;
    return usuarioDeCabecera(req.headers.authorization);
  },
);
