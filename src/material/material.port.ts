import type {
  ArchivoDescargado,
  ArchivoSubido,
  EvaluacionesTutor,
  EvaluacionPropia,
  Material,
  ResumenTutor,
} from './material.models';

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
  // El tutor necesita tener el ramo activo.
  subirArchivo(
    tutorId: string,
    ramoCodigo: string,
    titulo: string,
    archivo: ArchivoSubido,
  ): Promise<Material>;
  // Misma regla de visibilidad que listar.
  descargar(id: string, usuarioId: string): Promise<ArchivoDescargado>;
  // Solo el dueño.
  eliminar(id: string, tutorId: string): Promise<void>;
  // Solo si la sesión está FINALIZADA, el alumno participó y no la evaluó antes.
  evaluar(
    sesionId: string,
    estudianteId: string,
    nota: number,
    comentario: string,
  ): Promise<EvaluacionPropia>;
  // Anónimas: nunca incluyen al alumno ni la sesión.
  listarEvaluaciones(tutorId: string): Promise<EvaluacionesTutor>;
  listarMisEvaluaciones(estudianteId: string): Promise<EvaluacionPropia[]>;
  // Uno por cada id pedido, incluidos los que no tienen evaluaciones (0 y 0).
  obtenerResumenTutores(tutorIds: string[]): Promise<ResumenTutor[]>;
}
