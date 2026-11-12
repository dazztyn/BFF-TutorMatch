import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

// shortcut: confía en la cabecera x-usuario-id sin autenticar; reemplazar por un token verificado cuando exista el login de Usuarios.
export const UsuarioId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const id =
      GqlExecutionContext.create(ctx).getContext().req.headers['x-usuario-id'];
    if (typeof id !== 'string' || !id) {
      throw new UnauthorizedException('Falta la cabecera x-usuario-id');
    }
    return id;
  },
);
