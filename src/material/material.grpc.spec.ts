import { status } from '@grpc/grpc-js';
import { ForbiddenException } from '@nestjs/common';
import {
  levantarServidorFalso,
  type ServidorFalso,
} from '../../test/servidor-grpc-falso';
import { aTimestamp } from '../grpc';
import { MaterialGrpc } from './material.grpc';

const creado = new Date('2030-12-02T11:10:00.000Z');
const archivoProto = {
  nombre: 'guia.pdf',
  tipoMime: 'application/pdf',
  tamanoBytes: '13',
};
const avisoProto = {
  id: 'm-1',
  tutorId: 't-1',
  ramoCodigo: 'MAT1610',
  tipo: 'AVISO',
  titulo: 'Para el lunes',
  texto: 'Traigan calculadora',
  creadoEn: aTimestamp(creado),
};
const archivoMaterialProto = {
  ...avisoProto,
  id: 'm-2',
  tipo: 'ARCHIVO',
  texto: '',
  archivo: archivoProto,
};
const evaluacionProto = {
  sesionId: 's-1',
  tutorId: 't-1',
  ramoCodigo: 'MAT1610',
  nota: 5,
  comentario: 'Muy bien',
  creadaEn: aTimestamp(creado),
};

describe('MaterialGrpc', () => {
  let servidor: ServidorFalso;
  let material: MaterialGrpc;

  beforeAll(async () => {
    servidor = await levantarServidorFalso('material');
    material = new MaterialGrpc(servidor.url);
  });

  afterAll(async () => {
    material.onModuleDestroy();
    await servidor.cerrar();
  });

  const ultima = () => servidor.llamadas.at(-1)!;

  it('traduce avisos y archivos, sin texto en los archivos ni archivo en los avisos', async () => {
    servidor.respuestas.SubirMaterial = avisoProto;
    expect(
      await material.publicarAviso(
        't-1',
        'MAT1610',
        'Para el lunes',
        'Traigan calculadora',
      ),
    ).toEqual({
      id: 'm-1',
      tutorId: 't-1',
      ramoCodigo: 'MAT1610',
      tipo: 'AVISO',
      titulo: 'Para el lunes',
      texto: 'Traigan calculadora',
      archivo: null,
      creadoEn: creado,
    });
    expect(ultima().req.texto).toBe('Traigan calculadora');

    servidor.respuestas.ListarMaterial = { materiales: [archivoMaterialProto] };
    const [archivo] = await material.listar('e-1', { ramoCodigo: 'MAT1610' });
    expect(archivo).toMatchObject({
      tipo: 'ARCHIVO',
      texto: null,
      archivo: {
        nombre: 'guia.pdf',
        tipoMime: 'application/pdf',
        tamanoBytes: 13,
      },
    });
    expect(ultima().req).toMatchObject({
      usuarioId: 'e-1',
      ramoCodigo: 'MAT1610',
    });
  });

  it('sube y descarga los bytes del archivo', async () => {
    const datos = Buffer.from('%PDF-1.4\nhola');
    servidor.respuestas.SubirMaterial = archivoMaterialProto;
    await material.subirArchivo('t-1', 'MAT1610', 'Guía', {
      nombre: 'guia.pdf',
      tipoMime: 'application/pdf',
      datos,
    });
    expect(Buffer.from(ultima().req.archivo.datos)).toEqual(datos);

    servidor.respuestas.DescargarArchivo = { archivo: archivoProto, datos };
    const descarga = await material.descargar('m-2', 'e-1');
    expect(descarga.archivo.tamanoBytes).toBe(13);
    expect(Buffer.from(descarga.datos)).toEqual(datos);

    await material.eliminar('m-2', 't-1');
    expect(ultima()).toMatchObject({
      metodo: 'EliminarMaterial',
      req: { id: 'm-2', tutorId: 't-1' },
    });
  });

  it('traduce las evaluaciones y los resúmenes', async () => {
    servidor.respuestas.Evaluar = evaluacionProto;
    expect(await material.evaluar('s-1', 'e-1', 5, 'Muy bien')).toEqual({
      ...evaluacionProto,
      creadaEn: creado,
    });

    servidor.respuestas.ListarEvaluaciones = {
      evaluaciones: [
        {
          ramoCodigo: 'MAT1610',
          nota: 5,
          comentario: '',
          creadaEn: aTimestamp(creado),
        },
      ],
      promedio: 5,
      cantidad: 1,
    };
    expect(await material.listarEvaluaciones('t-1')).toEqual({
      evaluaciones: [
        { ramoCodigo: 'MAT1610', nota: 5, comentario: '', creadaEn: creado },
      ],
      promedio: 5,
      cantidad: 1,
    });

    servidor.respuestas.ListarMisEvaluaciones = {
      evaluaciones: [evaluacionProto],
    };
    expect(await material.listarMisEvaluaciones('e-1')).toHaveLength(1);

    servidor.respuestas.ObtenerResumenTutores = {
      resumenes: [{ tutorId: 't-1', promedio: 4.5, cantidad: 2 }],
    };
    expect(await material.obtenerResumenTutores(['t-1'])).toEqual([
      { tutorId: 't-1', promedio: 4.5, cantidad: 2 },
    ]);
  });

  it('traduce los errores del servicio', async () => {
    servidor.respuestas.EliminarMaterial = {
      code: status.PERMISSION_DENIED,
      details: 'solo el dueño',
    };
    await expect(material.eliminar('m-2', 'e-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
