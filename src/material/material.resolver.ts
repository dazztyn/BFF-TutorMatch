import { Inject } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UsuarioId } from '../usuario-id.decorator';
import { Material } from './material.models';
import { MATERIAL_PORT } from './material.port';
import type { MaterialPort } from './material.port';

@Resolver(() => Material)
export class MaterialResolver {
  constructor(@Inject(MATERIAL_PORT) private readonly material: MaterialPort) {}

  // El tutor es el usuario actual; necesita tener el ramo activo.
  @Mutation(() => Material)
  publicarAviso(
    @Args('ramoCodigo') ramoCodigo: string,
    @Args('titulo') titulo: string,
    @Args('texto') texto: string,
    @UsuarioId() tutorId: string,
  ): Promise<Material> {
    return this.material.publicarAviso(tutorId, ramoCodigo, titulo, texto);
  }

  @Query(() => [Material], {
    name: 'material',
    description:
      'Material visible para el usuario actual, del más nuevo al más antiguo; filtros opcionales',
  })
  listar(
    @UsuarioId() usuarioId: string,
    @Args('tutorId', { type: () => ID, nullable: true }) tutorId?: string,
    @Args('ramoCodigo', { nullable: true }) ramoCodigo?: string,
  ): Promise<Material[]> {
    return this.material.listar(usuarioId, { tutorId, ramoCodigo });
  }

  @Mutation(() => Boolean, { description: 'Solo el dueño' })
  async eliminarMaterial(
    @Args('id', { type: () => ID }) id: string,
    @UsuarioId() tutorId: string,
  ): Promise<boolean> {
    await this.material.eliminar(id, tutorId);
    return true;
  }
}
