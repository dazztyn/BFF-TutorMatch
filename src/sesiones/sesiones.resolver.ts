import { Inject } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UsuarioId } from '../usuario-id.decorator';
import {
  BloqueDisponibilidad,
  CrearSesionInput,
  DURACION_BLOQUE_MS,
  EstadoSesion,
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

  // La semana del tutor se pide en una sola consulta GraphQL con disponibilidad y sesiones del mismo rango.
  @Query(() => [Sesion], {
    name: 'sesiones',
    description: 'Filtros opcionales; desde y hasta se aplican al inicio',
  })
  listar(
    @Args('tutorId', { type: () => ID, nullable: true }) tutorId?: string,
    @Args('estudianteId', { type: () => ID, nullable: true })
    estudianteId?: string,
    @Args('estado', { type: () => EstadoSesion, nullable: true })
    estado?: EstadoSesion,
    @Args('desde', { type: () => Date, nullable: true }) desde?: Date,
    @Args('hasta', { type: () => Date, nullable: true }) hasta?: Date,
  ): Promise<Sesion[]> {
    return this.sesiones.listar({
      tutorId,
      estudianteId,
      estado,
      desde,
      hasta,
    });
  }

  @Query(() => [BloqueDisponibilidad], {
    description: 'Casillas de un tutor que empiezan en [desde, hasta)',
  })
  disponibilidad(
    @Args('tutorId', { type: () => ID }) tutorId: string,
    @Args('desde') desde: Date,
    @Args('hasta') hasta: Date,
  ): Promise<BloqueDisponibilidad[]> {
    return this.sesiones.obtenerDisponibilidad(tutorId, desde, hasta);
  }

  @Query(() => [BloqueDisponibilidad], {
    description:
      'Casillas libres de todos los tutores de un ramo que empiezan en [desde, hasta)',
  })
  buscarDisponibilidad(
    @Args('ramoCodigo') ramoCodigo: string,
    @Args('desde') desde: Date,
    @Args('hasta') hasta: Date,
  ): Promise<BloqueDisponibilidad[]> {
    return this.sesiones.buscarDisponibilidad(ramoCodigo, desde, hasta);
  }

  // El tutor es el usuario actual.
  @Mutation(() => BloqueDisponibilidad)
  marcarCasilla(
    @Args('ramoCodigo') ramoCodigo: string,
    @Args('inicio', { description: 'Inicio de un bloque de clase, en UTC' })
    inicio: Date,
    @UsuarioId() tutorId: string,
  ): Promise<BloqueDisponibilidad> {
    return this.sesiones.marcarCasilla(tutorId, ramoCodigo, inicio);
  }

  @Mutation(() => Boolean)
  async desmarcarCasilla(
    @Args('id', { type: () => ID }) id: string,
    @UsuarioId() tutorId: string,
  ): Promise<boolean> {
    await this.sesiones.desmarcarCasilla(id, tutorId);
    return true;
  }

  // Quien crea la sesión es el estudiante que la reserva.
  @Mutation(() => Sesion)
  crearSesion(
    @Args('input') input: CrearSesionInput,
    @UsuarioId() estudianteId: string,
  ): Promise<Sesion> {
    return this.sesiones.crear({
      ...input,
      estudianteId,
      fin: new Date(input.inicio.getTime() + DURACION_BLOQUE_MS),
    });
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
