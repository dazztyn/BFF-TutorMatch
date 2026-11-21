import type { Material } from './material.models';

export const MATERIAL_PORT = Symbol('MATERIAL_PORT');

// Filtros opcionales de ListarMaterial: un campo vacío no filtra.
export interface FiltroMaterial {
  tutorId?: string;
  ramoCodigo?: string;
}

// Mismas operaciones que contracts/proto/material/v1/material.proto, con los tipos del BFF.
export interface MaterialPort {
  publicarAviso(
    tutorId: string,
    ramoCodigo: string,
    titulo: string,
    texto: string,
  ): Promise<Material>;
  // Solo lo que usuarioId puede ver, del más nuevo al más antiguo; lo decide Material.
  listar(usuarioId: string, filtro: FiltroMaterial): Promise<Material[]>;
  // Solo el dueño.
  eliminar(id: string, tutorId: string): Promise<void>;
}
