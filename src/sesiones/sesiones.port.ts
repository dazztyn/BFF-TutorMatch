import type {
  BloqueDisponibilidad,
  CrearSesionInput,
  EstadoSesion,
  Sesion,
} from './sesiones.models';

export const SESIONES_PORT = Symbol('SESIONES_PORT');

export type NuevaSesion = CrearSesionInput & {
  estudianteId: string;
  fin: Date;
};

// Filtros opcionales de ListarSesiones; [desde, hasta) se aplica al inicio de la sesión.
export interface FiltroSesiones {
  tutorId?: string;
  estudianteId?: string;
  estado?: EstadoSesion;
  desde?: Date;
  hasta?: Date;
}

// Mismas operaciones que contracts/proto/sesiones/v1/sesiones.proto, con los tipos del BFF.
export interface SesionesPort {
  crear(datos: NuevaSesion): Promise<Sesion>;
  obtener(id: string): Promise<Sesion>;
  listar(filtro: FiltroSesiones): Promise<Sesion[]>;
  confirmar(id: string, usuarioId: string): Promise<Sesion>;
  cancelar(id: string, usuarioId: string): Promise<Sesion>;
  finalizar(id: string, usuarioId: string): Promise<Sesion>;
  marcarCasilla(
    tutorId: string,
    ramoCodigo: string,
    inicio: Date,
  ): Promise<BloqueDisponibilidad>;
  desmarcarCasilla(id: string, tutorId: string): Promise<void>;
  // Casillas de un tutor que empiezan en [desde, hasta), libres u ocupadas.
  obtenerDisponibilidad(
    tutorId: string,
    desde: Date,
    hasta: Date,
  ): Promise<BloqueDisponibilidad[]>;
  // Casillas libres de todos los tutores de un ramo que empiezan en [desde, hasta).
  buscarDisponibilidad(
    ramoCodigo: string,
    desde: Date,
    hasta: Date,
  ): Promise<BloqueDisponibilidad[]>;
}
