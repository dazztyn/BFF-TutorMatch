import type { OnModuleDestroy } from '@nestjs/common';
import { aDate, aTimestamp, ClienteGrpc, type Timestamp } from '../grpc';
import type {
  BloqueDisponibilidad,
  EstadoSesion,
  Sesion,
} from './sesiones.models';
import type {
  FiltroSesiones,
  NuevaSesion,
  SesionesPort,
} from './sesiones.port';

interface SesionProto {
  id: string;
  tutorId: string;
  estudianteId: string;
  ramoCodigo: string;
  inicio: Timestamp;
  fin: Timestamp;
  estado: EstadoSesion;
  creadaEn: Timestamp;
}

const aSesion = (s: SesionProto): Sesion => ({
  id: s.id,
  tutorId: s.tutorId,
  estudianteId: s.estudianteId,
  ramoCodigo: s.ramoCodigo,
  inicio: aDate(s.inicio),
  fin: aDate(s.fin),
  estado: s.estado,
  creadaEn: aDate(s.creadaEn),
});

const aBloque = (
  b: Omit<BloqueDisponibilidad, 'inicio' | 'fin'> & {
    inicio: Timestamp;
    fin: Timestamp;
  },
): BloqueDisponibilidad => ({
  id: b.id,
  tutorId: b.tutorId,
  ramoCodigo: b.ramoCodigo,
  inicio: aDate(b.inicio),
  fin: aDate(b.fin),
  libre: b.libre,
});

// Un Timestamp ausente en proto3 es "sin filtro".
const talVez = (d?: Date) => (d ? aTimestamp(d) : undefined);

// Adaptador real: llama al servicio de Sesiones (Spring Boot) por gRPC.
export class SesionesGrpc implements SesionesPort, OnModuleDestroy {
  private readonly grpc: ClienteGrpc;

  constructor(url: string) {
    this.grpc = new ClienteGrpc('sesiones', url);
  }

  onModuleDestroy() {
    this.grpc.cerrar();
  }

  async crear(datos: NuevaSesion): Promise<Sesion> {
    return aSesion(
      await this.grpc.llamar('CrearSesion', {
        ...datos,
        inicio: aTimestamp(datos.inicio),
        fin: aTimestamp(datos.fin),
      }),
    );
  }

  async obtener(id: string): Promise<Sesion> {
    return aSesion(await this.grpc.llamar('ObtenerSesion', { id }));
  }

  async listar(filtro: FiltroSesiones): Promise<Sesion[]> {
    const res = await this.grpc.llamar('ListarSesiones', {
      ...filtro,
      desde: talVez(filtro.desde),
      hasta: talVez(filtro.hasta),
    });
    return res.sesiones.map(aSesion);
  }

  async confirmar(id: string, usuarioId: string): Promise<Sesion> {
    return aSesion(
      await this.grpc.llamar('ConfirmarSesion', { id, usuarioId }),
    );
  }

  async cancelar(id: string, usuarioId: string): Promise<Sesion> {
    return aSesion(await this.grpc.llamar('CancelarSesion', { id, usuarioId }));
  }

  async finalizar(id: string, usuarioId: string): Promise<Sesion> {
    return aSesion(
      await this.grpc.llamar('FinalizarSesion', { id, usuarioId }),
    );
  }

  async marcarCasilla(
    tutorId: string,
    ramoCodigo: string,
    inicio: Date,
  ): Promise<BloqueDisponibilidad> {
    return aBloque(
      await this.grpc.llamar('MarcarCasilla', {
        tutorId,
        ramoCodigo,
        inicio: aTimestamp(inicio),
      }),
    );
  }

  async desmarcarCasilla(id: string, tutorId: string): Promise<void> {
    await this.grpc.llamar('DesmarcarCasilla', { id, tutorId });
  }

  async obtenerDisponibilidad(
    tutorId: string,
    desde: Date,
    hasta: Date,
  ): Promise<BloqueDisponibilidad[]> {
    const res = await this.grpc.llamar('ObtenerDisponibilidad', {
      tutorId,
      desde: aTimestamp(desde),
      hasta: aTimestamp(hasta),
    });
    return res.bloques.map(aBloque);
  }

  async buscarDisponibilidad(
    ramoCodigo: string,
    desde: Date,
    hasta: Date,
  ): Promise<BloqueDisponibilidad[]> {
    const res = await this.grpc.llamar('BuscarDisponibilidad', {
      ramoCodigo,
      desde: aTimestamp(desde),
      hasta: aTimestamp(hasta),
    });
    return res.bloques.map(aBloque);
  }
}
