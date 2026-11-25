import { Module } from '@nestjs/common';
import { UsuariosGrpc } from './usuarios.grpc';
import { UsuariosMock } from './usuarios.mock';
import { USUARIOS_PORT } from './usuarios.port';
import {
  BloqueUsuariosResolver,
  SesionUsuariosResolver,
  UsuariosResolver,
} from './usuarios.resolver';

@Module({
  providers: [
    UsuariosResolver,
    SesionUsuariosResolver,
    BloqueUsuariosResolver,
    // Único punto donde se elige el adaptador: gRPC si hay URL, si no el mock en memoria.
    {
      provide: USUARIOS_PORT,
      useFactory: () => {
        const url = process.env.USUARIOS_GRPC_URL;
        return url ? new UsuariosGrpc(url) : new UsuariosMock();
      },
    },
  ],
  // Material lo usa para validar que el tutor tiene el ramo activo.
  exports: [USUARIOS_PORT],
})
export class UsuariosModule {}
