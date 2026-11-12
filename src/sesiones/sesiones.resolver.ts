import { Inject } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UsuarioId } from '../usuario-id.decorator';
import {
  BloqueDisponibilidad,
  CrearSesionInput,
  Sesion,
} from './sesiones.models';
import { SESIONES_PORT } from './sesiones.port';
import type { SesionesPort } from './sesiones.port';

@Resolver(() => Sesion)
export class SesionesResolver {
  constructor(@Inject(SESIONES_PORT) private readonly sesiones: SesionesPort) {}

  @Query(() => Sesion, { nullable: true })
  sesion(@Args('id', { type: () => ID }) id: string): Promise<Sesion> {
    return this.sesiones.obtener(id);
  }

  @Query(() => [Sesion], { name: 'sesiones' })
  listar(
    @Args('tutorId', { type: () => ID, nullable: true }) tutorId?: string,
    @Args('estudianteId', { type: () => ID, nullable: true })
    estudianteId?: string,
  ): Promise<Sesion[]> {
    return this.sesiones.listar({ tutorId, estudianteId });
  }

  @Query(() => [BloqueDisponibilidad])
  disponibilidad(
    @Args('tutorId', { type: () => ID }) tutorId: string,
  ): Promise<BloqueDisponibilidad[]> {
    return this.sesiones.obtenerDisponibilidad(tutorId);
  }

  // Quien crea la sesión es el estudiante que la reserva.
  @Mutation(() => Sesion)
  crearSesion(
    @Args('input') input: CrearSesionInput,
    @UsuarioId() estudianteId: string,
  ): Promise<Sesion> {
    return this.sesiones.crear({ ...input, estudianteId });
  }

  @Mutation(() => Sesion)
  confirmarSesion(
    @Args('id', { type: () => ID }) id: string,
    @UsuarioId() usuarioId: string,
  ): Promise<Sesion> {
    return this.sesiones.confirmar(id, usuarioId);
  }

  @Mutation(() => Sesion)
  cancelarSesion(
    @Args('id', { type: () => ID }) id: string,
    @UsuarioId() usuarioId: string,
  ): Promise<Sesion> {
    return this.sesiones.cancelar(id, usuarioId);
  }

  @Mutation(() => Sesion)
  finalizarSesion(
    @Args('id', { type: () => ID }) id: string,
    @UsuarioId() usuarioId: string,
  ): Promise<Sesion> {
    return this.sesiones.finalizar(id, usuarioId);
  }
}
