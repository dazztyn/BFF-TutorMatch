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
  CrearSesionInput,
  EstadoSesion,
  Sesion,
} from './sesiones.models';
import type { SesionesPort } from './sesiones.port';

// Se resuelve desde la raíz del proyecto: en Docker hay que copiar proto/ junto a dist/.
const PROTO = join(process.cwd(), 'proto', 'sesiones.proto');
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

// Traduce los códigos de estado del contrato (ver proto/sesiones.proto) a errores HTTP/GraphQL.
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

  async crear(
    datos: CrearSesionInput & { estudianteId: string },
  ): Promise<Sesion> {
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

  async listar(filtro: {
    tutorId?: string;
    estudianteId?: string;
  }): Promise<Sesion[]> {
    const res = await this.llamar('ListarSesiones', filtro);
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

  async obtenerDisponibilidad(
    tutorId: string,
  ): Promise<BloqueDisponibilidad[]> {
    const res = await this.llamar('ObtenerDisponibilidad', { tutorId });
    return res.bloques;
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
