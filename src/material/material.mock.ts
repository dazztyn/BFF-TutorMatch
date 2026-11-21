import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EstadoSesion } from '../sesiones/sesiones.models';
import type { SesionesPort } from '../sesiones/sesiones.port';
import type { UsuariosPort } from '../usuarios/usuarios.port';
import {
  type ArchivoDescargado,
  type ArchivoSubido,
  TAMANO_MAXIMO_BYTES,
  TIPOS_PERMITIDOS,
  type EvaluacionesTutor,
  type EvaluacionPropia,
  type Material,
  type ResumenTutor,
  TipoMaterial,
} from './material.models';
import type { FiltroMaterial, MaterialPort } from './material.port';

// Reemplazo en memoria del servicio de Material, con las reglas del contrato; los datos
// se pierden al reiniciar. Consulta Sesiones y Usuarios por sus puertos, así funciona igual
// con sus mocks que con los servicios reales.
export class MaterialMock implements MaterialPort {
  private readonly materiales = new Map<string, Material>();
  // Bytes de cada ARCHIVO, por id de material.
  private readonly datos = new Map<string, Buffer>();
  // Clave: sesionId (una evaluación por sesión). Guarda al alumno solo para validar.
  private readonly evaluaciones = new Map<
    string,
    EvaluacionPropia & { estudianteId: string }
  >();

  constructor(
    private readonly sesiones: SesionesPort,
    private readonly usuarios: UsuariosPort,
  ) {}

  async publicarAviso(
    tutorId: string,
    ramoCodigo: string,
    titulo: string,
    texto: string,
  ): Promise<Material> {
    if (!ramoCodigo || !titulo.trim() || !texto.trim()) {
      throw new BadRequestException('Faltan el ramo, el título o el texto');
    }
    await this.exigirRamoActivo(tutorId, ramoCodigo);
    const aviso: Material = {
      id: randomUUID(),
      tutorId,
      ramoCodigo,
      tipo: TipoMaterial.AVISO,
      titulo: titulo.trim(),
      texto: texto.trim(),
      archivo: null,
      creadoEn: new Date(),
    };
    this.materiales.set(aviso.id, aviso);
    return aviso;
  }

  async listar(usuarioId: string, f: FiltroMaterial): Promise<Material[]> {
    const candidatos = [...this.materiales.values()]
      .filter(
        (m) =>
          (!f.tutorId || m.tutorId === f.tutorId) &&
          (!f.ramoCodigo || m.ramoCodigo === f.ramoCodigo),
      )
      .sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime());
    const visibles = await Promise.all(
      candidatos.map((m) => this.puedeVer(usuarioId, m)),
    );
    return candidatos.filter((_, i) => visibles[i]);
  }

  async subirArchivo(
    tutorId: string,
    ramoCodigo: string,
    titulo: string,
    archivo: ArchivoSubido,
  ): Promise<Material> {
    if (!ramoCodigo || !titulo.trim() || !archivo.datos.length) {
      throw new BadRequestException('Faltan el ramo, el título o el archivo');
    }
    if (
      archivo.datos.length > TAMANO_MAXIMO_BYTES ||
      !TIPOS_PERMITIDOS.includes(archivo.tipoMime)
    ) {
      throw new BadRequestException(
        'El archivo debe ser PDF, PNG o JPEG de hasta 10 MB',
      );
    }
    await this.exigirRamoActivo(tutorId, ramoCodigo);
    const material: Material = {
      id: randomUUID(),
      tutorId,
      ramoCodigo,
      tipo: TipoMaterial.ARCHIVO,
      titulo: titulo.trim(),
      texto: null,
      archivo: {
        nombre: archivo.nombre,
        tipoMime: archivo.tipoMime,
        tamanoBytes: archivo.datos.length,
      },
      creadoEn: new Date(),
    };
    this.materiales.set(material.id, material);
    this.datos.set(material.id, archivo.datos);
    return material;
  }

  async descargar(id: string, usuarioId: string): Promise<ArchivoDescargado> {
    const material = this.materiales.get(id);
    if (!material || !(await this.puedeVer(usuarioId, material))) {
      throw new NotFoundException(`No existe el material ${id}`);
    }
    if (!material.archivo) {
      throw new BadRequestException('Un aviso no tiene archivo que descargar');
    }
    return { archivo: material.archivo, datos: this.datos.get(id)! };
  }

  async eliminar(id: string, tutorId: string): Promise<void> {
    const material = this.materiales.get(id);
    // Si no puede verlo, se responde como si no existiera.
    if (!material || !(await this.puedeVer(tutorId, material))) {
      throw new NotFoundException(`No existe el material ${id}`);
    }
    if (material.tutorId !== tutorId) {
      throw new ForbiddenException('Solo el dueño puede eliminar el material');
    }
    this.materiales.delete(id);
    this.datos.delete(id);
  }

  async evaluar(
    sesionId: string,
    estudianteId: string,
    nota: number,
    comentario: string,
  ): Promise<EvaluacionPropia> {
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
      throw new BadRequestException('La nota debe ser un entero de 1 a 5');
    }
    if (comentario.length > 1000) {
      throw new BadRequestException(
        'El comentario no puede pasar de 1000 caracteres',
      );
    }
    // Equivale a Sesiones.VerificarParticipacion; una sesión inexistente responde NOT_FOUND.
    const sesion = await this.sesiones.obtener(sesionId);
    if (
      sesion.estado !== EstadoSesion.FINALIZADA ||
      sesion.estudianteId !== estudianteId
    ) {
      throw new ConflictException(
        'Solo se puede evaluar una sesión finalizada en la que participaste',
      );
    }
    if (this.evaluaciones.has(sesionId)) {
      throw new ConflictException('Esa sesión ya fue evaluada');
    }
    const evaluacion: EvaluacionPropia = {
      sesionId,
      tutorId: sesion.tutorId,
      ramoCodigo: sesion.ramoCodigo,
      nota,
      comentario: comentario.trim(),
      creadaEn: new Date(),
    };
    this.evaluaciones.set(sesionId, { ...evaluacion, estudianteId });
    return evaluacion;
  }

  async listarEvaluaciones(tutorId: string): Promise<EvaluacionesTutor> {
    const delTutor = this.delTutor(tutorId);
    return {
      ...resumir(delTutor),
      // Solo los campos públicos: nunca el alumno ni la sesión.
      evaluaciones: delTutor.map(
        ({ ramoCodigo, nota, comentario, creadaEn }) => ({
          ramoCodigo,
          nota,
          comentario,
          creadaEn,
        }),
      ),
    };
  }

  async listarMisEvaluaciones(
    estudianteId: string,
  ): Promise<EvaluacionPropia[]> {
    return [...this.evaluaciones.values()]
      .filter((e) => e.estudianteId === estudianteId)
      .sort((a, b) => b.creadaEn.getTime() - a.creadaEn.getTime())
      .map(({ sesionId, tutorId, ramoCodigo, nota, comentario, creadaEn }) => ({
        sesionId,
        tutorId,
        ramoCodigo,
        nota,
        comentario,
        creadaEn,
      }));
  }

  async obtenerResumenTutores(tutorIds: string[]): Promise<ResumenTutor[]> {
    return tutorIds.map((tutorId) => ({
      tutorId,
      ...resumir(this.delTutor(tutorId)),
    }));
  }

  // De la más nueva a la más antigua.
  private delTutor(tutorId: string) {
    return [...this.evaluaciones.values()]
      .filter((e) => e.tutorId === tutorId)
      .sort((a, b) => b.creadaEn.getTime() - a.creadaEn.getTime());
  }

  // El tutor ve lo suyo; un alumno, lo de un tutor en un ramo si tiene o tuvo una sesión
  // no cancelada con él en ese ramo.
  private async puedeVer(usuarioId: string, m: Material): Promise<boolean> {
    if (usuarioId === m.tutorId) return true;
    const sesiones = await this.sesiones.listar({
      tutorId: m.tutorId,
      estudianteId: usuarioId,
    });
    return sesiones.some(
      (s) =>
        s.ramoCodigo === m.ramoCodigo && s.estado !== EstadoSesion.CANCELADA,
    );
  }

  // Equivale a Usuarios.ValidarTutorRamo: un usuario inexistente tampoco es válido.
  private async exigirRamoActivo(tutorId: string, ramoCodigo: string) {
    const usuario = await this.usuarios
      .obtenerUsuario(tutorId)
      .catch((e: unknown) => {
        if (e instanceof NotFoundException) return null;
        throw e;
      });
    const activo = usuario?.ramos.some(
      (r) => r.ramo.codigo === ramoCodigo && r.activo,
    );
    if (!activo) {
      throw new ForbiddenException(`No tienes ${ramoCodigo} activo como tutor`);
    }
  }
}

// Promedio y cantidad; 0 y 0 si no hay evaluaciones.
const resumir = (evaluaciones: { nota: number }[]) => ({
  promedio: evaluaciones.length
    ? evaluaciones.reduce((suma, e) => suma + e.nota, 0) / evaluaciones.length
    : 0,
  cantidad: evaluaciones.length,
});
