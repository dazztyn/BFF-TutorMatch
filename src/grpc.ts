import { join } from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

const PLAZO_MS = 5000;

// google.protobuf.Timestamp tal como lo entrega proto-loader (longs: String).
export interface Timestamp {
  seconds: string | number;
  nanos: number;
}

export const aDate = (t: Timestamp): Date =>
  new Date(Number(t.seconds) * 1000 + Math.floor(t.nanos / 1e6));

export const aTimestamp = (d: Date): Timestamp => {
  const ms = d.getTime();
  const seconds = Math.floor(ms / 1000);
  return { seconds, nanos: (ms - seconds * 1000) * 1e6 };
};

type Metodo = (
  req: object,
  opciones: grpc.CallOptions,
  cb: (err: grpc.ServiceError | null, res: any) => void,
) => void;

// Traduce los códigos de estado de los contratos (ver la cabecera de cada .proto) a errores HTTP/GraphQL.
export const aExcepcion = (err: grpc.ServiceError, servicio: string): Error => {
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
    case grpc.status.UNAUTHENTICATED:
      return new UnauthorizedException(err.details);
    case grpc.status.UNAVAILABLE:
    case grpc.status.DEADLINE_EXCEEDED:
      return new ServiceUnavailableException(
        `El servicio de ${servicio} no responde`,
      );
    default:
      return err;
  }
};

// Cliente gRPC común a los adaptadores. Carga contracts/proto/<servicio>/v1/<servicio>.proto desde la
// raíz del proyecto (en Docker hay que copiar contracts/proto/) y el servicio tutorias.<servicio>.v1.<Servicio>Service.
export class ClienteGrpc {
  private readonly cliente: grpc.Client & Record<string, Metodo>;
  private readonly nombre: string;

  // opciones: opciones del canal gRPC, por ejemplo el tamaño máximo de mensaje.
  constructor(servicio: string, url: string, opciones?: grpc.ChannelOptions) {
    this.nombre = servicio[0].toUpperCase() + servicio.slice(1);
    const definicion = protoLoader.loadSync(
      join(
        process.cwd(),
        'contracts',
        'proto',
        servicio,
        'v1',
        `${servicio}.proto`,
      ),
      { longs: String, enums: String, defaults: true },
    );
    const paquete = grpc.loadPackageDefinition(definicion) as any;
    this.cliente = new paquete.tutorias[servicio].v1[`${this.nombre}Service`](
      url,
      grpc.credentials.createInsecure(),
      opciones,
    );
  }

  llamar(metodo: string, req: object): Promise<any> {
    return new Promise((resolve, reject) =>
      this.cliente[metodo](
        req,
        { deadline: Date.now() + PLAZO_MS },
        (err, res) =>
          err ? reject(aExcepcion(err, this.nombre)) : resolve(res),
      ),
    );
  }

  cerrar() {
    this.cliente.close();
  }
}
