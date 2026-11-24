import { BadRequestException, Inject } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { UsuarioId } from '../usuario-id.decorator';
import {
  MAXIMO_CONVERSACION_ID,
  MAXIMO_MENSAJE,
  RespuestaAgente,
} from './agente.models';
import { AGENTE_PORT } from './agente.port';
import type { AgentePort } from './agente.port';

@Resolver(() => RespuestaAgente)
export class AgenteResolver {
  constructor(@Inject(AGENTE_PORT) private readonly agente: AgentePort) {}

  @Mutation(() => RespuestaAgente, {
    description:
      'Conversa con el agente; puede tardar hasta unos 2 minutos si busca y reserva',
  })
  chatAgente(
    @Args('mensaje', { description: 'De 1 a 2000 caracteres' })
    mensaje: string,
    @UsuarioId() usuarioId: string,
    @Context() ctx: { req: { headers: { authorization: string } } },
    @Args('conversacionId', {
      nullable: true,
      description:
        'El que devolvió la respuesta anterior, para seguir la conversación',
    })
    conversacionId?: string,
  ): Promise<RespuestaAgente> {
    if (!mensaje.trim() || mensaje.length > MAXIMO_MENSAJE) {
      throw new BadRequestException(
        `El mensaje debe tener entre 1 y ${MAXIMO_MENSAJE} caracteres`,
      );
    }
    if (conversacionId && conversacionId.length > MAXIMO_CONVERSACION_ID) {
      throw new BadRequestException(
        `El conversacionId no puede pasar de ${MAXIMO_CONVERSACION_ID} caracteres`,
      );
    }
    // @UsuarioId ya validó esta cabecera; se reenvía tal cual para que el agente llame al BFF como el usuario.
    return this.agente.chat(
      { usuarioId, mensaje, conversacionId },
      ctx.req.headers.authorization,
    );
  }
}
