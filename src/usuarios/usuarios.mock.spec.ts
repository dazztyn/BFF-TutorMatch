import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { verificarToken } from '../jwt';
import { UsuariosMock } from './usuarios.mock';

const inscripcion = (ramoCodigo: string, nota = 6, periodo = '2025-2') => ({
  ramoCodigo,
  notaAprobacion: nota,
  periodoAprobacion: periodo,
});

describe('UsuariosMock', () => {
  let mock: UsuariosMock;
  let ana: string;

  beforeEach(async () => {
    mock = new UsuariosMock();
    ana = (
      await mock.registro({
        nombre: ' Ana ',
        email: 'ana@uc.cl',
        password: 'secreta',
      })
    ).usuario.id;
  });

  it('registra con un token válido y sin ser tutor', async () => {
    const { token, usuario } = await mock.registro({
      nombre: 'Beto',
      email: 'beto@uc.cl',
      password: 'otra',
    });
    expect(verificarToken(token)).toBe(usuario.id);
    expect(usuario).toMatchObject({
      nombre: 'Beto',
      esTutor: false,
      ramos: [],
    });
  });

  it('valida los datos y el email único sin importar mayúsculas', async () => {
    await expect(
      mock.registro({ nombre: '', email: 'x@uc.cl', password: 'p' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      mock.registro({ nombre: 'X', email: 'sin-arroba', password: 'p' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      mock.registro({ nombre: 'X', email: ' ANA@UC.CL ', password: 'p' }),
    ).rejects.toThrow(ConflictException);
  });

  it('inicia sesión solo con la contraseña correcta', async () => {
    const { usuario } = await mock.login({
      email: 'Ana@uc.cl',
      password: 'secreta',
    });
    expect(usuario.id).toBe(ana);
    await expect(
      mock.login({ email: 'ana@uc.cl', password: 'mala' }),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      mock.login({ email: 'nadie@uc.cl', password: 'secreta' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('obtiene usuarios uno a uno o en lote, omitiendo los que no existen', async () => {
    expect((await mock.obtenerUsuario(ana)).nombre).toBe('Ana');
    await expect(mock.obtenerUsuario('nadie')).rejects.toThrow(
      NotFoundException,
    );
    const lote = await mock.obtenerUsuarios([ana, 'nadie']);
    expect(lote.map((u) => u.id)).toEqual([ana]);
  });

  it('inscribe ramos todo o nada, validando el formulario', async () => {
    const casos: [object[], new (...args: never[]) => Error][] = [
      [[], BadRequestException],
      [[inscripcion('XXX0000')], NotFoundException],
      [[inscripcion('MAT1610', 3.9)], BadRequestException],
      [[inscripcion('MAT1610', 7.1)], BadRequestException],
      [[inscripcion('MAT1610', 6, '2025-3')], BadRequestException],
      [[inscripcion('MAT1610'), inscripcion('MAT1610')], BadRequestException],
      [[inscripcion('MAT1610'), inscripcion('XXX0000')], NotFoundException],
    ];
    for (const [ramos, Excepcion] of casos) {
      await expect(mock.agregarRamosTutor(ana, ramos as never)).rejects.toThrow(
        Excepcion,
      );
    }
    expect((await mock.obtenerUsuario(ana)).ramos).toEqual([]);

    const usuario = await mock.agregarRamosTutor(ana, [
      inscripcion('MAT1610'),
      inscripcion('MAT1620', 4),
    ]);
    expect(usuario.esTutor).toBe(true);
    expect(usuario.ramos.map((r) => r.ramo.codigo)).toEqual([
      'MAT1610',
      'MAT1620',
    ]);
    await expect(
      mock.agregarRamosTutor(ana, [inscripcion('MAT1610')]),
    ).rejects.toThrow(ConflictException);
    await expect(
      mock.agregarRamosTutor('nadie', [inscripcion('MAT1610')]),
    ).rejects.toThrow(NotFoundException);
  });

  it('quita y reactiva ramos, recalculando es_tutor', async () => {
    await mock.agregarRamosTutor(ana, [inscripcion('MAT1610')]);
    const tutores = await mock.listarTutoresPorRamo('MAT1610');
    expect(tutores.map((u) => u.id)).toEqual([ana]);

    const sinRamos = await mock.quitarRamoTutor(ana, 'MAT1610');
    expect(sinRamos.esTutor).toBe(false);
    expect(sinRamos.ramos).toEqual([
      { ramo: { codigo: 'MAT1610', nombre: 'Cálculo II' }, activo: false },
    ]);
    // Quitar un ramo ya inactivo no es error.
    expect((await mock.quitarRamoTutor(ana, 'MAT1610')).esTutor).toBe(false);
    expect(await mock.listarTutoresPorRamo('MAT1610')).toEqual([]);

    expect((await mock.reactivarRamoTutor(ana, 'MAT1610')).esTutor).toBe(true);
    await expect(mock.quitarRamoTutor(ana, 'IIC2233')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lista el catálogo de ramos', async () => {
    const codigos = (await mock.listarRamos()).map((r) => r.codigo);
    expect(codigos).toContain('MAT1610');
  });
});
