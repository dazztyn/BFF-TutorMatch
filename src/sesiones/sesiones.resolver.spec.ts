import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SesionesMock } from './sesiones.mock';
import { EstadoSesion, type Sesion } from './sesiones.models';
import { SesionesResolver } from './sesiones.resolver';

// Lunes 2 de diciembre de 2030, bloque A (08:10 en Chile = 11:10 UTC).
const inicio = new Date('2030-12-02T11:10:00Z');
const finDeSemana = new Date('2030-12-07T00:00:00Z');

describe('SesionesResolver', () => {
  let resolver: SesionesResolver;

  beforeEach(() => {
    resolver = new SesionesResolver(new SesionesMock());
  });

  it('recorre el flujo de una reserva con el usuario del token', async () => {
    const casilla = await resolver.marcarCasilla('MAT1610', inicio, 'tut-1');
    expect(casilla.tutorId).toBe('tut-1');

    // El front solo manda el inicio: el BFF calcula el fin de 90 minutos.
    const sesion = await resolver.crearSesion(
      { tutorId: 'tut-1', ramoCodigo: 'MAT1610', inicio },
      'est-1',
    );
    expect(sesion).toMatchObject({
      estudianteId: 'est-1',
      fin: new Date('2030-12-02T12:40:00Z'),
      estado: EstadoSesion.PENDIENTE,
    });

    expect((await resolver.confirmarSesion(sesion.id, 'tut-1')).estado).toBe(
      EstadoSesion.CONFIRMADA,
    );
    expect(await resolver.sesion(sesion.id, 'tut-1')).toMatchObject({
      id: sesion.id,
    });
    expect(
      await resolver.listar(
        'tut-1',
        'tut-1',
        undefined,
        EstadoSesion.CONFIRMADA,
        inicio,
        finDeSemana,
      ),
    ).toHaveLength(1);
    expect(await resolver.disponibilidad('tut-1', inicio, finDeSemana)).toEqual(
      [expect.objectContaining({ libre: false })],
    );
    expect(
      await resolver.buscarDisponibilidad('MAT1610', inicio, finDeSemana),
    ).toEqual([]);

    expect((await resolver.finalizarSesion(sesion.id, 'tut-1')).estado).toBe(
      EstadoSesion.FINALIZADA,
    );
  });

  it('cancela una reserva y desmarca la casilla que queda libre', async () => {
    const casilla = await resolver.marcarCasilla('MAT1610', inicio, 'tut-1');
    const sesion = await resolver.crearSesion(
      { tutorId: 'tut-1', ramoCodigo: 'MAT1610', inicio },
      'est-1',
    );
    expect((await resolver.cancelarSesion(sesion.id, 'est-1')).estado).toBe(
      EstadoSesion.CANCELADA,
    );
    expect(await resolver.desmarcarCasilla(casilla.id, 'tut-1')).toBe(true);
  });

  describe('solo muestra las sesiones del usuario', () => {
    // tut-1 enseña a est-1 el lunes; el miércoles est-2 le enseña a tut-1.
    const miercoles = new Date('2030-12-04T11:10:00Z');
    let deTutor: Sesion;
    let deAlumno: Sesion;

    beforeEach(async () => {
      await resolver.marcarCasilla('MAT1610', inicio, 'tut-1');
      deTutor = await resolver.crearSesion(
        { tutorId: 'tut-1', ramoCodigo: 'MAT1610', inicio },
        'est-1',
      );
      await resolver.marcarCasilla('MAT1610', miercoles, 'est-2');
      deAlumno = await resolver.crearSesion(
        { tutorId: 'est-2', ramoCodigo: 'MAT1610', inicio: miercoles },
        'tut-1',
      );
    });

    it('sin filtros de usuario, une las suyas como tutor y como alumno, por inicio', async () => {
      const lista = await resolver.listar('tut-1');
      expect(lista.map((s) => s.id)).toEqual([deTutor.id, deAlumno.id]);
      expect(await resolver.listar('nadie')).toEqual([]);
    });

    it('acepta filtros si uno de los ids es el suyo y rechaza los ajenos', async () => {
      expect(await resolver.listar('est-1', undefined, 'est-1')).toEqual([
        expect.objectContaining({ id: deTutor.id }),
      ]);
      await expect(resolver.listar('est-1', 'tut-1')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(resolver.listar('est-1', 'tut-1', 'est-2')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('una sesión ajena responde NOT_FOUND', async () => {
      expect(await resolver.sesion(deTutor.id, 'est-1')).toMatchObject({
        id: deTutor.id,
      });
      await expect(resolver.sesion(deTutor.id, 'est-2')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
