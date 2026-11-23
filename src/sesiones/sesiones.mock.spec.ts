import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { esInicioDeBloque, SesionesMock } from './sesiones.mock';
import { EstadoSesion } from './sesiones.models';

// Lunes 2 de diciembre de 2030, bloque A (08:10 en Chile = 11:10 UTC).
const inicio = new Date('2030-12-02T11:10:00Z');
const datos = {
  tutorId: 'tut-1',
  estudianteId: 'est-1',
  ramoCodigo: 'MAT1610',
  inicio,
  fin: new Date('2030-12-02T12:40:00Z'),
};

describe('SesionesMock', () => {
  let mock: SesionesMock;

  beforeEach(async () => {
    mock = new SesionesMock();
    await mock.marcarCasilla('tut-1', 'MAT1610', inicio);
  });

  it('reconoce solo inicios de bloque de lunes a viernes', () => {
    expect(esInicioDeBloque(inicio)).toBe(true);
    expect(esInicioDeBloque(new Date('2030-12-02T11:00:00Z'))).toBe(false);
    expect(esInicioDeBloque(new Date('2030-12-07T11:10:00Z'))).toBe(false);
  });

  it('solo reserva casillas libres y rechaza reservarse a sí mismo', async () => {
    await expect(
      mock.crear({ ...datos, estudianteId: 'tut-1' }),
    ).rejects.toThrow(BadRequestException);
    await mock.crear(datos);
    await expect(
      mock.crear({ ...datos, estudianteId: 'est-2' }),
    ).rejects.toThrow(ConflictException);
    const [casilla] = await mock.obtenerDisponibilidad(
      'tut-1',
      inicio,
      datos.fin,
    );
    expect(casilla.libre).toBe(false);
    await expect(mock.desmarcarCasilla(casilla.id, 'tut-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('respeta el ciclo de vida y quién puede cambiarlo', async () => {
    const { id } = await mock.crear(datos);

    await expect(mock.finalizar(id, 'tut-1')).rejects.toThrow(
      ConflictException,
    );
    await expect(mock.confirmar(id, 'est-1')).rejects.toThrow(
      ForbiddenException,
    );
    expect((await mock.confirmar(id, 'tut-1')).estado).toBe(
      EstadoSesion.CONFIRMADA,
    );
    await expect(mock.finalizar(id, 'est-1')).rejects.toThrow(
      ForbiddenException,
    );
    expect((await mock.finalizar(id, 'tut-1')).estado).toBe(
      EstadoSesion.FINALIZADA,
    );
  });

  it('marca solo bloques futuros y sin solapes del mismo tutor', async () => {
    const pasado = new Date('2020-12-01T11:10:00Z');
    await expect(
      mock.marcarCasilla('tut-1', 'MAT1610', pasado),
    ).rejects.toThrow(BadRequestException);
    await expect(
      mock.marcarCasilla('tut-1', 'MAT1610', new Date('2030-12-02T11:00:00Z')),
    ).rejects.toThrow(BadRequestException);
    // Otro ramo en el mismo bloque también se solapa.
    await expect(
      mock.marcarCasilla('tut-1', 'MAT1620', inicio),
    ).rejects.toThrow(ConflictException);
    // Otro tutor puede marcar el mismo bloque.
    const otra = await mock.marcarCasilla('tut-2', 'MAT1610', inicio);
    expect(otra).toMatchObject({ libre: true, fin: datos.fin });
  });

  it('desmarca solo casillas propias y existentes', async () => {
    const [casilla] = await mock.obtenerDisponibilidad(
      'tut-1',
      inicio,
      datos.fin,
    );
    await expect(mock.desmarcarCasilla('no-existe', 'tut-1')).rejects.toThrow(
      NotFoundException,
    );
    await expect(mock.desmarcarCasilla(casilla.id, 'tut-2')).rejects.toThrow(
      ForbiddenException,
    );
    await mock.desmarcarCasilla(casilla.id, 'tut-1');
    expect(
      await mock.obtenerDisponibilidad('tut-1', inicio, datos.fin),
    ).toEqual([]);
  });

  it('impide cruces entre papeles y libera la casilla al cancelar', async () => {
    // tut-1 reserva como alumno con tut-2 en el mismo bloque en que da clases.
    await mock.marcarCasilla('tut-2', 'MAT1610', inicio);
    await mock.crear({ ...datos, tutorId: 'tut-2', estudianteId: 'tut-1' });
    await expect(mock.crear(datos)).rejects.toThrow(ConflictException);

    const otraCasilla = new Date('2030-12-02T12:55:00Z');
    await mock.marcarCasilla('tut-1', 'MAT1610', otraCasilla);
    const sesion = await mock.crear({
      ...datos,
      inicio: otraCasilla,
      fin: new Date('2030-12-02T14:25:00Z'),
    });
    await expect(mock.cancelar(sesion.id, 'nadie')).rejects.toThrow(
      ForbiddenException,
    );
    expect((await mock.cancelar(sesion.id, 'est-1')).estado).toBe(
      EstadoSesion.CANCELADA,
    );
    const [libre] = await mock.buscarDisponibilidad(
      'MAT1610',
      otraCasilla,
      new Date('2030-12-03T00:00:00Z'),
    );
    expect(libre).toMatchObject({ tutorId: 'tut-1', libre: true });
    await expect(mock.obtener('no-existe')).rejects.toThrow(NotFoundException);
  });

  it('filtra la lista de sesiones por participante, estado y fechas', async () => {
    const { id } = await mock.crear(datos);
    await mock.confirmar(id, 'tut-1');
    const enDiciembre = { desde: inicio, hasta: new Date('2030-12-03') };

    expect(
      await mock.listar({ tutorId: 'tut-1', ...enDiciembre }),
    ).toHaveLength(1);
    expect(await mock.listar({ estudianteId: 'est-2' })).toEqual([]);
    expect(await mock.listar({ estado: EstadoSesion.PENDIENTE })).toEqual([]);
    expect(await mock.listar({ estado: EstadoSesion.CONFIRMADA })).toHaveLength(
      1,
    );
    expect(await mock.listar({ hasta: inicio })).toEqual([]);
  });
});
