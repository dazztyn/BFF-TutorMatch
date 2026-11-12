import { Module } from '@nestjs/common';
import { SesionesMock } from './sesiones.mock';
import { SESIONES_PORT } from './sesiones.port';
import { SesionesResolver } from './sesiones.resolver';

@Module({
  providers: [
    SesionesResolver,
    // Único punto donde se elige el adaptador: aquí entrará el de gRPC.
    { provide: SESIONES_PORT, useClass: SesionesMock },
  ],
})
export class SesionesModule {}
