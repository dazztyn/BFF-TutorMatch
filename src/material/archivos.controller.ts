import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TokenGuard } from '../token.guard';
import { UsuarioId } from '../usuario-id.decorator';
import {
  type Material,
  TAMANO_MAXIMO_BYTES,
  TIPOS_PERMITIDOS,
} from './material.models';
import { MATERIAL_PORT } from './material.port';
import type { MaterialPort } from './material.port';

// Lo que entrega multer con almacenamiento en memoria (sin depender de @types/multer).
interface ArchivoMultipart {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

// Primeros bytes de cada tipo permitido: el tipo MIME lo manda el cliente y se puede falsificar.
const FIRMAS: Record<string, number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
};

export const calzaFirma = (tipoMime: string, datos: Buffer): boolean =>
  FIRMAS[tipoMime]?.every((byte, i) => datos[i] === byte) ?? false;

// RFC 6266 + 5987: filename para clientes antiguos (solo ASCII) y filename* con el nombre en UTF-8.
export const contentDisposition = (nombre: string): string => {
  const ascii = nombre.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const utf8 = encodeURIComponent(nombre).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${ascii}"; filename*=UTF-8''${utf8}`;
};

// Los archivos no pasan por GraphQL: llegan y salen por HTTP y viajan a Material por gRPC.
@Controller('archivos')
@UseGuards(TokenGuard)
export class ArchivosController {
  constructor(@Inject(MATERIAL_PORT) private readonly material: MaterialPort) {}

  // Multipart: archivo, ramoCodigo y titulo. El tutor es el usuario del token.
  @Post()
  @UseInterceptors(
    FileInterceptor('archivo', {
      // Más de 10 MB responde 413; defParamCharset evita que los nombres con tildes se lean como latin1.
      limits: { fileSize: TAMANO_MAXIMO_BYTES, files: 1, fields: 10 },
      defParamCharset: 'utf8',
    }),
  )
  subir(
    @UploadedFile() archivo: ArchivoMultipart | undefined,
    @Body('ramoCodigo') ramoCodigo: string | undefined,
    @Body('titulo') titulo: string | undefined,
    @UsuarioId() tutorId: string,
  ): Promise<Material> {
    if (!archivo) {
      throw new BadRequestException('Falta el archivo (campo "archivo")');
    }
    if (
      !TIPOS_PERMITIDOS.includes(archivo.mimetype) ||
      !calzaFirma(archivo.mimetype, archivo.buffer)
    ) {
      throw new BadRequestException('El archivo debe ser PDF, PNG o JPEG');
    }
    return this.material.subirArchivo(tutorId, ramoCodigo ?? '', titulo ?? '', {
      nombre: archivo.originalname,
      tipoMime: archivo.mimetype,
      datos: archivo.buffer,
    });
  }

  @Get(':id')
  // El navegador no debe adivinar otro tipo que el declarado.
  @Header('X-Content-Type-Options', 'nosniff')
  async descargar(
    @Param('id') id: string,
    @UsuarioId() usuarioId: string,
  ): Promise<StreamableFile> {
    const { archivo, datos } = await this.material.descargar(id, usuarioId);
    return new StreamableFile(datos, {
      type: archivo.tipoMime,
      length: datos.length,
      disposition: contentDisposition(archivo.nombre),
    });
  }
}
