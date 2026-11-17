import type {
  Acceso,
  InscripcionRamoInput,
  LoginInput,
  Ramo,
  RegistroInput,
  Usuario,
} from './usuarios.models';

export const USUARIOS_PORT = Symbol('USUARIOS_PORT');

// Mismas operaciones que contracts/proto/usuarios/v1/usuarios.proto, con los tipos del BFF.
// ValidarTutorRamo no está: lo usan Sesiones y Material, no el BFF.
export interface UsuariosPort {
  registro(datos: RegistroInput): Promise<Acceso>;
  login(datos: LoginInput): Promise<Acceso>;
  obtenerUsuario(id: string): Promise<Usuario>;
  // Los ids que no existen se omiten, sin error.
  obtenerUsuarios(ids: string[]): Promise<Usuario[]>;
  // Todo o nada: si un ramo falla, no se inscribe ninguno.
  agregarRamosTutor(
    usuarioId: string,
    ramos: InscripcionRamoInput[],
  ): Promise<Usuario>;
  quitarRamoTutor(usuarioId: string, ramoCodigo: string): Promise<Usuario>;
  reactivarRamoTutor(usuarioId: string, ramoCodigo: string): Promise<Usuario>;
  listarRamos(): Promise<Ramo[]>;
  listarTutoresPorRamo(ramoCodigo: string): Promise<Usuario[]>;
}
