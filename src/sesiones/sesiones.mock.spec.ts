import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
    expect((await mock.finalizar(id, 'est-1')).estado).toBe(
      EstadoSesion.FINALIZADA,
    );
  });
});
