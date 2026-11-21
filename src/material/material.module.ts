import { Module } from '@nestjs/common';
import { SesionesModule } from '../sesiones/sesiones.module';
import { SESIONES_PORT, type SesionesPort } from '../sesiones/sesiones.port';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { USUARIOS_PORT, type UsuariosPort } from '../usuarios/usuarios.port';
import { MaterialGrpc } from './material.grpc';
import { MaterialMock } from './material.mock';
import { MATERIAL_PORT } from './material.port';
import { MaterialResolver } from './material.resolver';

@Module({
  // El mock consulta Sesiones (visibilidad) y Usuarios (ramo activo) por sus puertos.
  imports: [SesionesModule, UsuariosModule],
  providers: [
    MaterialResolver,
    // Único punto donde se elige el adaptador: gRPC si hay URL, si no el mock en memoria.
    {
      provide: MATERIAL_PORT,
      inject: [SESIONES_PORT, USUARIOS_PORT],
      useFactory: (sesiones: SesionesPort, usuarios: UsuariosPort) => {
        const url = process.env.MATERIAL_GRPC_URL;
        return url
          ? new MaterialGrpc(url)
          : new MaterialMock(sesiones, usuarios);
      },
    },
  ],
})
export class MaterialModule {}
