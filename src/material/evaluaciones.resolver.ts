import { Inject } from '@nestjs/common';
import {
  Args,
  Context,
  Float,
  ID,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { type Cargador, crearCargador } from '../cargador';
import { UsuarioId } from '../usuario-id.decorator';
import { Usuario } from '../usuarios/usuarios.models';
import {
  EvaluacionesTutor,
  EvaluacionPropia,
  type ResumenTutor,
} from './material.models';
import { MATERIAL_PORT } from './material.port';
import type { MaterialPort } from './material.port';

@Resolver(() => EvaluacionPropia)
export class EvaluacionesResolver {
  constructor(@Inject(MATERIAL_PORT) private readonly material: MaterialPort) {}

  // El alumno es el usuario actual.
  @Mutation(() => EvaluacionPropia, {
    description:
      'Solo una sesión FINALIZADA en la que participaste, una vez por sesión',
  })
  evaluar(
    @Args('sesionId', { type: () => ID }) sesionId: string,
    @Args('nota', { type: () => Int, description: 'Entero de 1 a 5' })
    nota: number,
    @UsuarioId() estudianteId: string,
    @Args('comentario', {
      nullable: true,
      description: 'Hasta 1000 caracteres',
    })
    comentario?: string,
  ): Promise<EvaluacionPropia> {
    return this.material.evaluar(
      sesionId,
      estudianteId,
      nota,
      comentario ?? '',
    );
  }

  // Exige sesión iniciada aunque no use el id: las evaluaciones son públicas solo para usuarios registrados.
  @Query(() => EvaluacionesTutor, {
    description: 'Evaluaciones anónimas de un tutor, con su promedio',
  })
  evaluacionesTutor(
    @Args('tutorId', { type: () => ID }) tutorId: string,
    @UsuarioId() _usuarioId: string,
  ): Promise<EvaluacionesTutor> {
    return this.material.listarEvaluaciones(tutorId);
  }

  @Query(() => [EvaluacionPropia], {
    description: 'Evaluaciones escritas por el usuario actual',
  })
  misEvaluaciones(
    @UsuarioId() estudianteId: string,
  ): Promise<EvaluacionPropia[]> {
    return this.material.listarMisEvaluaciones(estudianteId);
  }
}

// Agrega a Usuario el promedio y la cantidad de evaluaciones, pedidos en lote a Material.
@Resolver(() => Usuario)
export class ResumenTutorResolver {
  constructor(@Inject(MATERIAL_PORT) private readonly material: MaterialPort) {}

  @ResolveField(() => Float, { description: '0 si no tiene evaluaciones' })
  async promedioEvaluaciones(
    @Parent() usuario: Usuario,
    @Context() ctx: ContextoGraphql,
  ): Promise<number> {
    return (await this.cargador(ctx)(usuario.id))?.promedio ?? 0;
  }

  @ResolveField(() => Int)
  async cantidadEvaluaciones(
    @Parent() usuario: Usuario,
    @Context() ctx: ContextoGraphql,
  ): Promise<number> {
    return (await this.cargador(ctx)(usuario.id))?.cantidad ?? 0;
  }

  private cargador(ctx: ContextoGraphql): Cargador<ResumenTutor> {
    return (ctx.cargadorResumenes ??= crearCargador(
      (ids) => this.material.obtenerResumenTutores(ids),
      (r) => r.tutorId,
    ));
  }
}

// El contexto GraphQL es un objeto nuevo por request.
interface ContextoGraphql {
  cargadorResumenes?: Cargador<ResumenTutor>;
}
