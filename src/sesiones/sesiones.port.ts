import type {
  BloqueDisponibilidad,
  CrearSesionInput,
  Sesion,
} from './sesiones.models';

export const SESIONES_PORT = Symbol('SESIONES_PORT');

// Mismas operaciones que proto/sesiones.proto, con los tipos del BFF.
export interface SesionesPort {
  crear(datos: CrearSesionInput & { estudianteId: string }): Promise<Sesion>;
  obtener(id: string): Promise<Sesion>;
  listar(filtro: {
    tutorId?: string;
    estudianteId?: string;
  }): Promise<Sesion[]>;
  confirmar(id: string, usuarioId: string): Promise<Sesion>;
  cancelar(id: string, usuarioId: string): Promise<Sesion>;
  finalizar(id: string, usuarioId: string): Promise<Sesion>;
  obtenerDisponibilidad(tutorId: string): Promise<BloqueDisponibilidad[]>;
}
