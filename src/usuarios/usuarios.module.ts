import { Module } from '@nestjs/common';
import { UsuariosGrpc } from './usuarios.grpc';
import { UsuariosMock } from './usuarios.mock';
import { USUARIOS_PORT } from './usuarios.port';
import { SesionUsuariosResolver, UsuariosResolver } from './usuarios.resolver';

@Module({
  providers: [
    UsuariosResolver,
    SesionUsuariosResolver,
    // Único punto donde se elige el adaptador: gRPC si hay URL, si no el mock en memoria.
    {
      provide: USUARIOS_PORT,
      useFactory: () => {
        const url = process.env.USUARIOS_GRPC_URL;
        return url ? new UsuariosGrpc(url) : new UsuariosMock();
      },
    },
  ],
})
export class UsuariosModule {}
