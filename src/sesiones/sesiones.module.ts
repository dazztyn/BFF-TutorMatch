import { Module } from '@nestjs/common';
import { SesionesGrpc } from './sesiones.grpc';
import { SesionesMock } from './sesiones.mock';
import { SESIONES_PORT } from './sesiones.port';
import { SesionesResolver } from './sesiones.resolver';

@Module({
  providers: [
    SesionesResolver,
    // Único punto donde se elige el adaptador: gRPC si hay URL, si no el mock en memoria.
    {
      provide: SESIONES_PORT,
      useFactory: () => {
        const url = process.env.SESIONES_GRPC_URL;
        return url ? new SesionesGrpc(url) : new SesionesMock();
      },
    },
  ],
})
export class SesionesModule {}
