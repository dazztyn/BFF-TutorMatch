import { Inject } from '@nestjs/common';
import {
  Args,
  Context,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { Sesion } from '../sesiones/sesiones.models';
import { UsuarioId } from '../usuario-id.decorator';
import {
  type CargadorUsuarios,
  crearCargadorUsuarios,
} from './cargador-usuarios';
import {
  Acceso,
  InscripcionRamoInput,
  LoginInput,
  Ramo,
  RegistroInput,
  Usuario,
} from './usuarios.models';
import { USUARIOS_PORT } from './usuarios.port';
import type { UsuariosPort } from './usuarios.port';

@Resolver(() => Usuario)
export class UsuariosResolver {
  constructor(@Inject(USUARIOS_PORT) private readonly usuarios: UsuariosPort) {}

  // Crea la cuenta y deja la sesión iniciada.
  @Mutation(() => Acceso)
  registro(@Args('input') input: RegistroInput): Promise<Acceso> {
    return this.usuarios.registro(input);
  }

  @Mutation(() => Acceso)
  login(@Args('input') input: LoginInput): Promise<Acceso> {
    return this.usuarios.login(input);
  }

  @Query(() => Usuario, { description: 'El usuario actual' })
  yo(@UsuarioId() usuarioId: string): Promise<Usuario> {
    return this.usuarios.obtenerUsuario(usuarioId);
  }

  @Query(() => [Ramo], { description: 'Catálogo de ramos' })
  ramos(): Promise<Ramo[]> {
    return this.usuarios.listarRamos();
  }

  @Query(() => [Usuario], { description: 'Tutores con ese ramo activo' })
  tutoresPorRamo(@Args('ramoCodigo') ramoCodigo: string): Promise<Usuario[]> {
    return this.usuarios.listarTutoresPorRamo(ramoCodigo);
  }

  @Mutation(() => Usuario, {
    description:
      'Formulario de inscripción como tutor; todo o nada si un ramo falla',
  })
  agregarRamosTutor(
    @Args('ramos', { type: () => [InscripcionRamoInput] })
    ramos: InscripcionRamoInput[],
    @UsuarioId() usuarioId: string,
  ): Promise<Usuario> {
    return this.usuarios.agregarRamosTutor(usuarioId, ramos);
  }

  @Mutation(() => Usuario, {
    description: 'Deja de impartir un ramo; se puede reactivar',
  })
  quitarRamoTutor(
    @Args('ramoCodigo') ramoCodigo: string,
    @UsuarioId() usuarioId: string,
  ): Promise<Usuario> {
    return this.usuarios.quitarRamoTutor(usuarioId, ramoCodigo);
  }

  @Mutation(() => Usuario, {
    description: 'Vuelve a impartir un ramo quitado, sin repetir el formulario',
  })
  reactivarRamoTutor(
    @Args('ramoCodigo') ramoCodigo: string,
    @UsuarioId() usuarioId: string,
  ): Promise<Usuario> {
    return this.usuarios.reactivarRamoTutor(usuarioId, ramoCodigo);
  }
}

// Agrega a Sesion los datos del tutor y del alumno, pedidos en lote a Usuarios.
@Resolver(() => Sesion)
export class SesionUsuariosResolver {
  constructor(@Inject(USUARIOS_PORT) private readonly usuarios: UsuariosPort) {}

  @ResolveField(() => Usuario, {
    nullable: true,
    description: 'null si el usuario ya no existe',
  })
  tutor(
    @Parent() sesion: Sesion,
    @Context() ctx: ContextoGraphql,
  ): Promise<Usuario | null> {
    return this.cargador(ctx)(sesion.tutorId);
  }

  @ResolveField(() => Usuario, {
    nullable: true,
    description: 'null si el usuario ya no existe',
  })
  estudiante(
    @Parent() sesion: Sesion,
    @Context() ctx: ContextoGraphql,
  ): Promise<Usuario | null> {
    return this.cargador(ctx)(sesion.estudianteId);
  }

  private cargador(ctx: ContextoGraphql): CargadorUsuarios {
    return (ctx.cargadorUsuarios ??= crearCargadorUsuarios((ids) =>
      this.usuarios.obtenerUsuarios(ids),
    ));
  }
}

// El contexto GraphQL es un objeto nuevo por request.
interface ContextoGraphql {
  cargadorUsuarios?: CargadorUsuarios;
}
