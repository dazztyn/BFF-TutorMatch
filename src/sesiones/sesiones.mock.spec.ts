import { ConflictException, ForbiddenException } from '@nestjs/common';
import { SesionesMock } from './sesiones.mock';
import { EstadoSesion } from './sesiones.models';

const datos = {
  tutorId: 'tut-1',
  estudianteId: 'est-1',
  ramoCodigo: 'MAT1620',
  inicio: new Date('2026-12-03T18:00:00Z'),
  fin: new Date('2026-12-03T19:00:00Z'),
};

describe('SesionesMock', () => {
  let mock: SesionesMock;

  beforeEach(() => {
    mock = new SesionesMock();
  });

  it('rechaza una sesión que choca con otra del mismo tutor', async () => {
    await mock.crear(datos);
    await expect(
      mock.crear({ ...datos, estudianteId: 'est-2' }),
    ).rejects.toThrow(ConflictException);
  });

  it('respeta el ciclo de vida y quién puede cambiarlo', async () => {
    const { id } = await mock.crear(datos);

    await expect(mock.finalizar(id, 'tut-1')).rejects.toThrow(
      ConflictException,
    );
    await expect(mock.confirmar(id, 'otro')).rejects.toThrow(
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
