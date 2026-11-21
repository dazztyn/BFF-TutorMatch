import type { OnModuleDestroy } from '@nestjs/common';
import { aDate, ClienteGrpc, type Timestamp } from '../grpc';
import type { Material, TipoMaterial } from './material.models';
import type { FiltroMaterial, MaterialPort } from './material.port';

// Los mensajes llevan archivos de hasta 10 MB; gRPC usa 4 MB por defecto.
const LIMITE_MENSAJE = 11 * 1024 * 1024;

interface MaterialProto {
  id: string;
  tutorId: string;
  ramoCodigo: string;
  tipo: TipoMaterial;
  titulo: string;
  texto: string;
  archivo: {
    nombre: string;
    tipoMime: string;
    tamanoBytes: string | number;
  } | null;
  creadoEn: Timestamp;
}

const aMaterial = (m: MaterialProto): Material => ({
  id: m.id,
  tutorId: m.tutorId,
  ramoCodigo: m.ramoCodigo,
  tipo: m.tipo,
  titulo: m.titulo,
  texto: m.tipo === 'AVISO' ? m.texto : null,
  archivo: m.archivo
    ? { ...m.archivo, tamanoBytes: Number(m.archivo.tamanoBytes) }
    : null,
  creadoEn: aDate(m.creadoEn),
});

// Adaptador real: llama al servicio de Material (NestJS, Ien) por gRPC.
export class MaterialGrpc implements MaterialPort, OnModuleDestroy {
  private readonly grpc: ClienteGrpc;

  constructor(url: string) {
    this.grpc = new ClienteGrpc('material', url, {
      'grpc.max_send_message_length': LIMITE_MENSAJE,
      'grpc.max_receive_message_length': LIMITE_MENSAJE,
    });
  }

  onModuleDestroy() {
    this.grpc.cerrar();
  }

  async publicarAviso(
    tutorId: string,
    ramoCodigo: string,
    titulo: string,
    texto: string,
  ): Promise<Material> {
    return aMaterial(
      await this.grpc.llamar('SubirMaterial', {
        tutorId,
        ramoCodigo,
        titulo,
        texto,
      }),
    );
  }

  async listar(usuarioId: string, filtro: FiltroMaterial): Promise<Material[]> {
    const res = await this.grpc.llamar('ListarMaterial', {
      usuarioId,
      ...filtro,
    });
    return res.materiales.map(aMaterial);
  }

  async eliminar(id: string, tutorId: string): Promise<void> {
    await this.grpc.llamar('EliminarMaterial', { id, tutorId });
  }
}
