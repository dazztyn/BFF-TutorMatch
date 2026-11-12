import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BloqueDisponibilidad,
  CrearSesionInput,
  EstadoSesion,
  Sesion,
} from './sesiones.models';
import type { SesionesPort } from './sesiones.port';

const { PENDIENTE, CONFIRMADA, FINALIZADA, CANCELADA } = EstadoSesion;

// Desde qué estados se puede llegar a cada estado.
const ORIGENES: Partial<Record<EstadoSesion, EstadoSesion[]>> = {
  [CONFIRMADA]: [PENDIENTE],
  [CANCELADA]: [PENDIENTE, CONFIRMADA],
  [FINALIZADA]: [CONFIRMADA],
};

// Reemplazo en memoria del servicio de Sesiones: aplica las mismas reglas del
// contrato, pero los datos se pierden al reiniciar.
@Injectable()
export class SesionesMock implements SesionesPort {
  private readonly sesiones = new Map<string, Sesion>();

  async crear(
    datos: CrearSesionInput & { estudianteId: string },
  ): Promise<Sesion> {
    if (datos.fin <= datos.inicio) {
      throw new BadRequestException('El fin debe ser posterior al inicio');
    }
    const choca = [...this.sesiones.values()].some(
      (s) =>
        s.tutorId === datos.tutorId &&
        (s.estado === PENDIENTE || s.estado === CONFIRMADA) &&
        s.inicio < datos.fin &&
        datos.inicio < s.fin,
    );
    if (choca) {
      throw new ConflictException(
        'El tutor ya tiene una sesión en ese horario',
      );
    }
    const sesion: Sesion = {
      ...datos,
      id: randomUUID(),
      estado: PENDIENTE,
      creadaEn: new Date(),
    };
    this.sesiones.set(sesion.id, sesion);
    return sesion;
  }

  async obtener(id: string): Promise<Sesion> {
    const sesion = this.sesiones.get(id);
    if (!sesion) throw new NotFoundException(`No existe la sesión ${id}`);
    return sesion;
  }

  async listar(filtro: {
    tutorId?: string;
    estudianteId?: string;
  }): Promise<Sesion[]> {
    return [...this.sesiones.values()].filter(
      (s) =>
        (!filtro.tutorId || s.tutorId === filtro.tutorId) &&
        (!filtro.estudianteId || s.estudianteId === filtro.estudianteId),
    );
  }

  confirmar(id: string, usuarioId: string): Promise<Sesion> {
    return this.cambiarEstado(id, usuarioId, CONFIRMADA);
  }

  cancelar(id: string, usuarioId: string): Promise<Sesion> {
    return this.cambiarEstado(id, usuarioId, CANCELADA);
  }

  finalizar(id: string, usuarioId: string): Promise<Sesion> {
    return this.cambiarEstado(id, usuarioId, FINALIZADA);
  }

  async obtenerDisponibilidad(
    tutorId: string,
  ): Promise<BloqueDisponibilidad[]> {
    return [
      { tutorId, dia: 1, horaIni: '15:00', horaFin: '18:00' },
      { tutorId, dia: 4, horaIni: '15:00', horaFin: '18:00' },
    ];
  }

  private async cambiarEstado(
    id: string,
    usuarioId: string,
    destino: EstadoSesion,
  ): Promise<Sesion> {
    const sesion = await this.obtener(id);
    if (usuarioId !== sesion.tutorId && usuarioId !== sesion.estudianteId) {
      throw new ForbiddenException('El usuario no participa en la sesión');
    }
    if (!ORIGENES[destino]?.includes(sesion.estado)) {
      throw new ConflictException(
        `Una sesión ${sesion.estado} no puede pasar a ${destino}`,
      );
    }
    sesion.estado = destino;
    return sesion;
  }
}
