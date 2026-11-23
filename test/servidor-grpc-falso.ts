import { join } from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

// Servidor gRPC de prueba con el .proto real del contrato: cada RPC responde lo que diga
// `respuestas` (un mensaje o un error con código) y guarda lo que recibió en `llamadas`.
export interface ServidorFalso {
  url: string;
  llamadas: { metodo: string; req: any }[];
  respuestas: Record<string, object | { code: grpc.status; details: string }>;
  cerrar: () => Promise<void>;
}

export const levantarServidorFalso = async (
  servicio: string,
): Promise<ServidorFalso> => {
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
  const nombre = servicio[0].toUpperCase() + servicio.slice(1);
  const { service } = (grpc.loadPackageDefinition(definicion) as any).tutorias[
    servicio
  ].v1[`${nombre}Service`];

  const falso = { llamadas: [], respuestas: {} } as unknown as ServidorFalso;
  const impl: grpc.UntypedServiceImplementation = {};
  for (const metodo of Object.keys(service)) {
    impl[metodo] = (call: any, cb: grpc.sendUnaryData<any>) => {
      falso.llamadas.push({ metodo, req: call.request });
      const respuesta: any = falso.respuestas[metodo] ?? {};
      if ('code' in respuesta) cb(respuesta);
      else cb(null, respuesta);
    };
  }

  const server = new grpc.Server();
  server.addService(service, impl);
  const puerto = await new Promise<number>((listo, falla) =>
    server.bindAsync(
      '127.0.0.1:0',
      grpc.ServerCredentials.createInsecure(),
      (err, p) => (err ? falla(err) : listo(p)),
    ),
  );
  falso.url = `127.0.0.1:${puerto}`;
  falso.cerrar = () =>
    new Promise((listo) => server.tryShutdown(() => listo()));
  return falso;
};
