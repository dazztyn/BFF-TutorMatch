import { EstadoSesion, type Sesion } from '../sesiones/sesiones.models';
import { UsuariosMock } from './usuarios.mock';
import { SesionUsuariosResolver, UsuariosResolver } from './usuarios.resolver';

describe('UsuariosResolver', () => {
  let mock: UsuariosMock;
  let resolver: UsuariosResolver;

  beforeEach(() => {
    mock = new UsuariosMock();
    resolver = new UsuariosResolver(mock);
  });

  it('registra, inicia sesión y maneja los ramos del usuario del token', async () => {
    const { usuario } = await resolver.registro({
      nombre: 'Ana',
      email: 'ana@uc.cl',
      password: 'secreta',
    });
    const acceso = await resolver.login({
      email: 'ana@uc.cl',
      password: 'secreta',
    });
    expect(acceso.usuario.id).toBe(usuario.id);
    expect((await resolver.yo(usuario.id)).esTutor).toBe(false);

    const tutora = await resolver.agregarRamosTutor(
      [
        {
          ramoCodigo: 'MAT1610',
          notaAprobacion: 6,
          periodoAprobacion: '2025-2',
        },
      ],
      usuario.id,
    );
    expect(tutora.esTutor).toBe(true);
    expect(await resolver.tutoresPorRamo('MAT1610')).toHaveLength(1);
    expect(
      (await resolver.quitarRamoTutor('MAT1610', usuario.id)).esTutor,
    ).toBe(false);
    expect(
      (await resolver.reactivarRamoTutor('MAT1610', usuario.id)).esTutor,
    ).toBe(true);
    expect((await resolver.ramos()).length).toBeGreaterThan(0);
  });
});

describe('SesionUsuariosResolver', () => {
  it('trae al tutor y al alumno en una sola llamada en lote por consulta', async () => {
    const mock = new UsuariosMock();
    const ana = (
      await mock.registro({ nombre: 'Ana', email: 'a@uc.cl', password: 'p' })
    ).usuario;
    const beto = (
      await mock.registro({ nombre: 'Beto', email: 'b@uc.cl', password: 'p' })
    ).usuario;
    const enLote = jest.spyOn(mock, 'obtenerUsuarios');
    const resolver = new SesionUsuariosResolver(mock);
    const sesion = {
      tutorId: ana.id,
      estudianteId: beto.id,
      estado: EstadoSesion.PENDIENTE,
    } as Sesion;
    const ctx = {};

    const [tutor, estudiante, otraVez] = await Promise.all([
      resolver.tutor(sesion, ctx),
      resolver.estudiante(sesion, ctx),
      resolver.tutor(sesion, ctx),
    ]);
    expect([tutor?.nombre, estudiante?.nombre, otraVez?.nombre]).toEqual([
      'Ana',
      'Beto',
      'Ana',
    ]);
    expect(enLote).toHaveBeenCalledTimes(1);
  });
});
