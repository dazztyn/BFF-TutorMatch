import type { OnModuleDestroy } from '@nestjs/common';
import { ClienteGrpc } from '../grpc';
import type {
  Acceso,
  InscripcionRamoInput,
  LoginInput,
  Ramo,
  RegistroInput,
  Usuario,
} from './usuarios.models';
import type { UsuariosPort } from './usuarios.port';

// Adaptador real: llama al servicio de Usuarios (Go) por gRPC. Los mensajes de proto-loader
// ya vienen en camelCase con la misma forma que los modelos GraphQL.
export class UsuariosGrpc implements UsuariosPort, OnModuleDestroy {
  private readonly grpc: ClienteGrpc;

  constructor(url: string) {
    this.grpc = new ClienteGrpc('usuarios', url);
  }

  onModuleDestroy() {
    this.grpc.cerrar();
  }

  registro(datos: RegistroInput): Promise<Acceso> {
    return this.grpc.llamar('RegistroUsuario', datos);
  }

  login(datos: LoginInput): Promise<Acceso> {
    return this.grpc.llamar('Login', datos);
  }

  obtenerUsuario(id: string): Promise<Usuario> {
    return this.grpc.llamar('ObtenerUsuario', { id });
  }

  async obtenerUsuarios(ids: string[]): Promise<Usuario[]> {
    return (await this.grpc.llamar('ObtenerUsuarios', { ids })).usuarios;
  }

  agregarRamosTutor(
    usuarioId: string,
    ramos: InscripcionRamoInput[],
  ): Promise<Usuario> {
    return this.grpc.llamar('AgregarRamosTutor', { usuarioId, ramos });
  }

  quitarRamoTutor(usuarioId: string, ramoCodigo: string): Promise<Usuario> {
    return this.grpc.llamar('QuitarRamoTutor', { usuarioId, ramoCodigo });
  }

  reactivarRamoTutor(usuarioId: string, ramoCodigo: string): Promise<Usuario> {
    return this.grpc.llamar('ReactivarRamoTutor', { usuarioId, ramoCodigo });
  }

  async listarRamos(): Promise<Ramo[]> {
    return (await this.grpc.llamar('ListarRamos', {})).ramos;
  }

  async listarTutoresPorRamo(ramoCodigo: string): Promise<Usuario[]> {
    return (await this.grpc.llamar('ListarTutoresPorRamo', { ramoCodigo }))
      .tutores;
  }
}
