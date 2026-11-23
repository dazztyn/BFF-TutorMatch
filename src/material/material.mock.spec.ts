import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SesionesMock } from '../sesiones/sesiones.mock';
import { UsuariosMock } from '../usuarios/usuarios.mock';
import { MaterialMock } from './material.mock';

// Lunes 2 de diciembre de 2030: bloques A (11:10 UTC) y B (12:55 UTC).
const A = new Date('2030-12-02T11:10:00Z');
const B = new Date('2030-12-02T12:55:00Z');
const MIN_90 = 90 * 60 * 1000;
const pdf = Buffer.from('%PDF-1.4\nhola');

describe('MaterialMock', () => {
  let sesiones: SesionesMock;
  let usuarios: UsuariosMock;
  let material: MaterialMock;
  let tutor: string;

  const reservar = async (inicio: Date, estudianteId: string) => {
    await sesiones.marcarCasilla(tutor, 'MAT1610', inicio);
    return sesiones.crear({
      tutorId: tutor,
      estudianteId,
      ramoCodigo: 'MAT1610',
      inicio,
      fin: new Date(inicio.getTime() + MIN_90),
    });
  };

  beforeEach(async () => {
    sesiones = new SesionesMock();
    usuarios = new UsuariosMock();
    material = new MaterialMock(sesiones, usuarios);
    const registro = await usuarios.registro({
      nombre: 'Ana',
      email: 'ana@uc.cl',
      password: 'p',
    });
    tutor = registro.usuario.id;
    await usuarios.agregarRamosTutor(tutor, [
      { ramoCodigo: 'MAT1610', notaAprobacion: 6, periodoAprobacion: '2025-2' },
    ]);
  });

  describe('avisos y visibilidad', () => {
    it('solo publica quien tiene el ramo activo', async () => {
      await expect(
        material.publicarAviso(tutor, 'MAT1610', 'T', ' '),
      ).rejects.toThrow(BadRequestException);
      await expect(
        material.publicarAviso(tutor, 'MAT1620', 'T', 'x'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        material.publicarAviso('nadie', 'MAT1610', 'T', 'x'),
      ).rejects.toThrow(ForbiddenException);

      const aviso = await material.publicarAviso(
        tutor,
        'MAT1610',
        ' T ',
        ' hola ',
      );
      expect(aviso).toMatchObject({
        tipo: 'AVISO',
        titulo: 'T',
        texto: 'hola',
        archivo: null,
      });
    });

    it('el alumno ve el material solo con una sesión no cancelada en ese ramo', async () => {
      const aviso = await material.publicarAviso(tutor, 'MAT1610', 'T', 'x');
      expect(await material.listar(tutor, {})).toHaveLength(1);
      expect(await material.listar('alumno', {})).toEqual([]);

      const sesion = await reservar(A, 'alumno');
      const visibles = await material.listar('alumno', { tutorId: tutor });
      expect(visibles.map((m) => m.id)).toEqual([aviso.id]);
      expect(
        await material.listar('alumno', { ramoCodigo: 'MAT1620' }),
      ).toEqual([]);

      await sesiones.cancelar(sesion.id, 'alumno');
      expect(await material.listar('alumno', {})).toEqual([]);
    });

    it('solo el dueño elimina; quien no lo ve recibe 404', async () => {
      const aviso = await material.publicarAviso(tutor, 'MAT1610', 'T', 'x');
      await reservar(A, 'alumno');
      await expect(material.eliminar(aviso.id, 'otro')).rejects.toThrow(
        NotFoundException,
      );
      await expect(material.eliminar(aviso.id, 'alumno')).rejects.toThrow(
        ForbiddenException,
      );
      await material.eliminar(aviso.id, tutor);
      await expect(material.eliminar(aviso.id, tutor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('archivos', () => {
    const archivo = {
      nombre: 'guia.pdf',
      tipoMime: 'application/pdf',
      datos: pdf,
    };

    it('valida el archivo y el ramo antes de guardarlo', async () => {
      const invalidos = [
        { ...archivo, datos: Buffer.alloc(0) },
        { ...archivo, tipoMime: 'text/plain' },
        { ...archivo, datos: Buffer.alloc(10 * 1024 * 1024 + 1) },
      ];
      for (const invalido of invalidos) {
        await expect(
          material.subirArchivo(tutor, 'MAT1610', 'T', invalido),
        ).rejects.toThrow(BadRequestException);
      }
      await expect(
        material.subirArchivo(tutor, 'MAT1620', 'T', archivo),
      ).rejects.toThrow(ForbiddenException);
    });

    it('descarga con la misma regla de visibilidad y borra los bytes al eliminar', async () => {
      const subido = await material.subirArchivo(
        tutor,
        'MAT1610',
        'Guía',
        archivo,
      );
      expect(subido.archivo).toEqual({
        nombre: 'guia.pdf',
        tipoMime: 'application/pdf',
        tamanoBytes: pdf.length,
      });
      expect((await material.descargar(subido.id, tutor)).datos).toEqual(pdf);
      await expect(material.descargar(subido.id, 'alumno')).rejects.toThrow(
        NotFoundException,
      );
      await expect(material.descargar('no-existe', tutor)).rejects.toThrow(
        NotFoundException,
      );

      const aviso = await material.publicarAviso(tutor, 'MAT1610', 'T', 'x');
      await expect(material.descargar(aviso.id, tutor)).rejects.toThrow(
        BadRequestException,
      );

      await material.eliminar(subido.id, tutor);
      await expect(material.descargar(subido.id, tutor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('evaluaciones', () => {
    const finalizada = async (inicio: Date, alumno: string) => {
      const sesion = await reservar(inicio, alumno);
      await sesiones.confirmar(sesion.id, tutor);
      await sesiones.finalizar(sesion.id, tutor);
      return sesion.id;
    };

    it('valida la nota, el comentario, la sesión y la participación', async () => {
      const pendiente = (await reservar(A, 'alumno')).id;
      for (const nota of [0, 6, 4.5]) {
        await expect(
          material.evaluar(pendiente, 'alumno', nota, ''),
        ).rejects.toThrow(BadRequestException);
      }
      await expect(
        material.evaluar(pendiente, 'alumno', 5, 'x'.repeat(1001)),
      ).rejects.toThrow(BadRequestException);
      await expect(
        material.evaluar('no-existe', 'alumno', 5, ''),
      ).rejects.toThrow(NotFoundException);
      // La sesión todavía no está FINALIZADA.
      await expect(
        material.evaluar(pendiente, 'alumno', 5, ''),
      ).rejects.toThrow(ConflictException);
    });

    it('acepta una evaluación por sesión y la muestra anónima', async () => {
      const s1 = await finalizada(A, 'alumno');
      const s2 = await finalizada(B, 'alumno');
      await expect(material.evaluar(s1, 'otro', 5, '')).rejects.toThrow(
        ConflictException,
      );

      expect(
        await material.evaluar(s1, 'alumno', 5, ' Muy bien '),
      ).toMatchObject({
        sesionId: s1,
        tutorId: tutor,
        ramoCodigo: 'MAT1610',
        nota: 5,
        comentario: 'Muy bien',
      });
      await expect(material.evaluar(s1, 'alumno', 4, '')).rejects.toThrow(
        ConflictException,
      );
      await material.evaluar(s2, 'alumno', 4, '');

      const publicas = await material.listarEvaluaciones(tutor);
      expect(publicas).toMatchObject({ promedio: 4.5, cantidad: 2 });
      expect(Object.keys(publicas.evaluaciones[0]).sort()).toEqual([
        'comentario',
        'creadaEn',
        'nota',
        'ramoCodigo',
      ]);

      const mias = await material.listarMisEvaluaciones('alumno');
      expect(mias.map((e) => e.sesionId).sort()).toEqual([s1, s2].sort());
      expect(mias[0]).not.toHaveProperty('estudianteId');
      expect(await material.listarMisEvaluaciones('otro')).toEqual([]);

      expect(
        await material.obtenerResumenTutores([tutor, 'sin-evaluaciones']),
      ).toEqual([
        { tutorId: tutor, promedio: 4.5, cantidad: 2 },
        { tutorId: 'sin-evaluaciones', promedio: 0, cantidad: 0 },
      ]);
    });
  });
});
