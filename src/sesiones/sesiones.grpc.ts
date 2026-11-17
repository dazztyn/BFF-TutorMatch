import { join } from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
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

// Se resuelve desde la raíz del proyecto: en Docker ahora hay que copiar contracts/proto/, no proto/
const PROTO = join(
  process.cwd(),
  'contracts',
  'proto',
  'sesiones',
  'v1',
  'sesiones.proto',
);
const PLAZO_MS = 5000;

// google.protobuf.Timestamp tal como lo entrega proto-loader (longs: String).
interface Timestamp {
  seconds: string | number;
  nanos: number;
}

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

type Metodo = (
  req: object,
  opciones: grpc.CallOptions,
  cb: (err: grpc.ServiceError | null, res: any) => void,
) => void;

export const aDate = (t: Timestamp): Date =>
  new Date(Number(t.seconds) * 1000 + Math.floor(t.nanos / 1e6));

export const aTimestamp = (d: Date): Timestamp => {
  const ms = d.getTime();
  const seconds = Math.floor(ms / 1000);
  return { seconds, nanos: (ms - seconds * 1000) * 1e6 };
};

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

// Traduce los códigos de estado del contrato (ver la cabecera de sesiones.proto) a errores HTTP/GraphQL.
export const aExcepcion = (err: grpc.ServiceError): Error => {
  switch (err.code) {
    case grpc.status.NOT_FOUND:
      return new NotFoundException(err.details);
    case grpc.status.ALREADY_EXISTS:
    case grpc.status.FAILED_PRECONDITION:
      return new ConflictException(err.details);
    case grpc.status.PERMISSION_DENIED:
      return new ForbiddenException(err.details);
    case grpc.status.INVALID_ARGUMENT:
      return new BadRequestException(err.details);
    case grpc.status.UNAVAILABLE:
    case grpc.status.DEADLINE_EXCEEDED:
      return new ServiceUnavailableException(
        'El servicio de Sesiones no responde',
      );
    default:
      return err;
  }
};

// Adaptador real: llama al servicio de Sesiones (Spring Boot) por gRPC.
export class SesionesGrpc implements SesionesPort, OnModuleDestroy {
  private readonly cliente: grpc.Client & Record<string, Metodo>;

  constructor(url: string) {
    const definicion = protoLoader.loadSync(PROTO, {
      longs: String,
      enums: String,
      defaults: true,
    });
    const paquete = grpc.loadPackageDefinition(definicion) as any;
    this.cliente = new paquete.tutorias.sesiones.v1.SesionesService(
      url,
      grpc.credentials.createInsecure(),
    );
  }

  onModuleDestroy() {
    this.cliente.close();
  }

  async crear(datos: NuevaSesion): Promise<Sesion> {
    return aSesion(
      await this.llamar('CrearSesion', {
        ...datos,
        inicio: aTimestamp(datos.inicio),
        fin: aTimestamp(datos.fin),
      }),
    );
  }

  async obtener(id: string): Promise<Sesion> {
    return aSesion(await this.llamar('ObtenerSesion', { id }));
  }

  async listar(filtro: FiltroSesiones): Promise<Sesion[]> {
    const res = await this.llamar('ListarSesiones', {
      ...filtro,
      desde: talVez(filtro.desde),
      hasta: talVez(filtro.hasta),
    });
    return res.sesiones.map(aSesion);
  }

  async confirmar(id: string, usuarioId: string): Promise<Sesion> {
    return aSesion(await this.llamar('ConfirmarSesion', { id, usuarioId }));
  }

  async cancelar(id: string, usuarioId: string): Promise<Sesion> {
    return aSesion(await this.llamar('CancelarSesion', { id, usuarioId }));
  }

  async finalizar(id: string, usuarioId: string): Promise<Sesion> {
    return aSesion(await this.llamar('FinalizarSesion', { id, usuarioId }));
  }

  async marcarCasilla(
    tutorId: string,
    ramoCodigo: string,
    inicio: Date,
  ): Promise<BloqueDisponibilidad> {
    return aBloque(
      await this.llamar('MarcarCasilla', {
        tutorId,
        ramoCodigo,
        inicio: aTimestamp(inicio),
      }),
    );
  }

  async desmarcarCasilla(id: string, tutorId: string): Promise<void> {
    await this.llamar('DesmarcarCasilla', { id, tutorId });
  }

  async obtenerDisponibilidad(
    tutorId: string,
    desde: Date,
    hasta: Date,
  ): Promise<BloqueDisponibilidad[]> {
    const res = await this.llamar('ObtenerDisponibilidad', {
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
    const res = await this.llamar('BuscarDisponibilidad', {
      ramoCodigo,
      desde: aTimestamp(desde),
      hasta: aTimestamp(hasta),
    });
    return res.bloques.map(aBloque);
  }

  private llamar(metodo: string, req: object): Promise<any> {
    return new Promise((resolve, reject) =>
      this.cliente[metodo](
        req,
        { deadline: Date.now() + PLAZO_MS },
        (err, res) => (err ? reject(aExcepcion(err)) : resolve(res)),
      ),
    );
  }
}
