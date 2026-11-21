import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EstadoSesion } from '../sesiones/sesiones.models';
import type { SesionesPort } from '../sesiones/sesiones.port';
import type { UsuariosPort } from '../usuarios/usuarios.port';
import { type Material, TipoMaterial } from './material.models';
import type { FiltroMaterial, MaterialPort } from './material.port';

// Reemplazo en memoria del servicio de Material, con las reglas del contrato; los datos
// se pierden al reiniciar. Consulta Sesiones y Usuarios por sus puertos, así funciona igual
// con sus mocks que con los servicios reales.
export class MaterialMock implements MaterialPort {
  private readonly materiales = new Map<string, Material>();

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
