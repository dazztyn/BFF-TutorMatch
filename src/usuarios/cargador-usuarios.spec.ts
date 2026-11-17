import { crearCargadorUsuarios } from './cargador-usuarios';

describe('crearCargadorUsuarios', () => {
  it('junta los ids en una sola llamada y deja en null los que no existen', async () => {
    const obtener = jest.fn(async (ids: string[]) =>
      ids
        .filter((id) => id !== 'nadie')
        .map((id) => ({
          id,
          nombre: id,
          email: '',
          esTutor: false,
          ramos: [],
        })),
    );
    const cargar = crearCargadorUsuarios(obtener);

    const [a, b, otraVezA, nadie] = await Promise.all([
      cargar('a'),
      cargar('b'),
      cargar('a'),
      cargar('nadie'),
    ]);

    expect(obtener).toHaveBeenCalledTimes(1);
    expect(obtener).toHaveBeenCalledWith(['a', 'b', 'nadie']);
    expect([a?.id, b?.id, otraVezA?.id, nadie]).toEqual(['a', 'b', 'a', null]);
  });
});
