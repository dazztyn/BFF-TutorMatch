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
  DURACION_BLOQUE_MS,
  EstadoSesion,
  Sesion,
} from './sesiones.models';
import type {
  FiltroSesiones,
  NuevaSesion,
  SesionesPort,
} from './sesiones.port';

const { PENDIENTE, CONFIRMADA, FINALIZADA, CANCELADA } = EstadoSesion;

// Desde qué estados se puede llegar a cada estado.
const ORIGENES: Partial<Record<EstadoSesion, EstadoSesion[]>> = {
  [CONFIRMADA]: [PENDIENTE],
  [CANCELADA]: [PENDIENTE, CONFIRMADA],
  [FINALIZADA]: [CONFIRMADA],
};

// Inicio de los bloques de clase A a F, en hora de Chile.
const INICIOS_DE_BLOQUE = [
  '08:10',
  '09:55',
  '11:40',
  '14:30',
  '16:15',
  '18:00',
];
const HORA_CHILE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Santiago',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Lunes a viernes, a la hora exacta de inicio de un bloque en America/Santiago.
export const esInicioDeBloque = (d: Date): boolean => {
  const p = Object.fromEntries(
    HORA_CHILE.formatToParts(d).map((x) => [x.type, x.value]),
  );
  return (
    d.getTime() % 60_000 === 0 &&
    !['Sat', 'Sun'].includes(p.weekday) &&
    INICIOS_DE_BLOQUE.includes(`${p.hour}:${p.minute}`)
  );
};

const activa = (s: Sesion) => s.estado === PENDIENTE || s.estado === CONFIRMADA;
const seCruzan = (
  a: { inicio: Date; fin: Date },
  b: { inicio: Date; fin: Date },
) => a.inicio < b.fin && b.inicio < a.fin;

type Casilla = Omit<BloqueDisponibilidad, 'libre'>;

// Reemplazo en memoria del servicio de Sesiones: aplica las mismas reglas del
// contrato (salvo ValidarTutorRamo, que siempre acepta), pero los datos se pierden al reiniciar.
@Injectable()
export class SesionesMock implements SesionesPort {
  private readonly sesiones = new Map<string, Sesion>();
  private readonly casillas = new Map<string, Casilla>();

  async crear(datos: NuevaSesion): Promise<Sesion> {
    if (datos.tutorId === datos.estudianteId) {
      throw new BadRequestException('No puedes reservarte a ti mismo');
    }
    const casilla = [...this.casillas.values()].find(
      (c) =>
        c.tutorId === datos.tutorId &&
        c.ramoCodigo === datos.ramoCodigo &&
        c.inicio.getTime() === datos.inicio.getTime() &&
        c.fin.getTime() === datos.fin.getTime(),
    );
    if (!casilla || !this.libre(casilla)) {
      throw new ConflictException('No hay una casilla libre para ese horario');
    }
    const participantes = [datos.tutorId, datos.estudianteId];
    const cruce = [...this.sesiones.values()].some(
      (s) =>
        activa(s) &&
        seCruzan(s, datos) &&
        (participantes.includes(s.tutorId) ||
          participantes.includes(s.estudianteId)),
    );
    if (cruce) {
      throw new ConflictException(
        'Uno de los participantes ya tiene una sesión en ese horario',
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

  async listar(f: FiltroSesiones): Promise<Sesion[]> {
    return [...this.sesiones.values()]
      .filter(
        (s) =>
          (!f.tutorId || s.tutorId === f.tutorId) &&
          (!f.estudianteId || s.estudianteId === f.estudianteId) &&
          (!f.estado || s.estado === f.estado) &&
          (!f.desde || s.inicio >= f.desde) &&
          (!f.hasta || s.inicio < f.hasta),
      )
      .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  }

  async confirmar(id: string, usuarioId: string): Promise<Sesion> {
    if ((await this.obtener(id)).tutorId !== usuarioId) {
      throw new ForbiddenException('Solo el tutor puede confirmar la sesión');
    }
    return this.cambiarEstado(id, usuarioId, CONFIRMADA);
  }

  cancelar(id: string, usuarioId: string): Promise<Sesion> {
    return this.cambiarEstado(id, usuarioId, CANCELADA);
  }

  finalizar(id: string, usuarioId: string): Promise<Sesion> {
    return this.cambiarEstado(id, usuarioId, FINALIZADA);
  }

  async marcarCasilla(
    tutorId: string,
    ramoCodigo: string,
    inicio: Date,
  ): Promise<BloqueDisponibilidad> {
    if (!esInicioDeBloque(inicio) || inicio <= new Date()) {
      throw new BadRequestException(
        'La casilla debe ser un bloque de clase futuro, de lunes a viernes',
      );
    }
    const casilla: Casilla = {
      id: randomUUID(),
      tutorId,
      ramoCodigo,
      inicio,
      fin: new Date(inicio.getTime() + DURACION_BLOQUE_MS),
    };
    const solapa = [...this.casillas.values()].some(
      (c) => c.tutorId === tutorId && seCruzan(c, casilla),
    );
    if (solapa) {
      throw new ConflictException('Ya tienes una casilla en ese horario');
    }
    this.casillas.set(casilla.id, casilla);
    return { ...casilla, libre: true };
  }

  async desmarcarCasilla(id: string, tutorId: string): Promise<void> {
    const casilla = this.casillas.get(id);
    if (!casilla) throw new NotFoundException(`No existe la casilla ${id}`);
    if (casilla.tutorId !== tutorId) {
      throw new ForbiddenException('La casilla no es tuya');
    }
    if (!this.libre(casilla)) {
      throw new ConflictException(
        'La casilla tiene una sesión pendiente o confirmada; cancélala primero',
      );
    }
    this.casillas.delete(id);
  }

  async obtenerDisponibilidad(
    tutorId: string,
    desde: Date,
    hasta: Date,
  ): Promise<BloqueDisponibilidad[]> {
    return this.enRango((c) => c.tutorId === tutorId, desde, hasta);
  }

  async buscarDisponibilidad(
    ramoCodigo: string,
    desde: Date,
    hasta: Date,
  ): Promise<BloqueDisponibilidad[]> {
    return this.enRango(
      (c) => c.ramoCodigo === ramoCodigo,
      desde,
      hasta,
    ).filter((b) => b.libre);
  }

  private enRango(
    cumple: (c: Casilla) => boolean,
    desde: Date,
    hasta: Date,
  ): BloqueDisponibilidad[] {
    return [...this.casillas.values()]
      .filter((c) => cumple(c) && c.inicio >= desde && c.inicio < hasta)
      .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
      .map((c) => ({ ...c, libre: this.libre(c) }));
  }

  // Libre si ninguna sesión activa de ese tutor se cruza con la casilla.
  private libre(c: Casilla): boolean {
    return ![...this.sesiones.values()].some(
      (s) => s.tutorId === c.tutorId && activa(s) && seCruzan(s, c),
    );
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
