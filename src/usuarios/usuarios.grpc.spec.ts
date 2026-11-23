import { status } from '@grpc/grpc-js';
import { UnauthorizedException } from '@nestjs/common';
import {
  levantarServidorFalso,
  type ServidorFalso,
} from '../../test/servidor-grpc-falso';
import { UsuariosGrpc } from './usuarios.grpc';

const usuario = {
  id: 'u-1',
  nombre: 'Ana',
  email: 'ana@uc.cl',
  esTutor: true,
  ramos: [{ ramo: { codigo: 'MAT1610', nombre: 'Cálculo I' }, activo: true }],
};

describe('UsuariosGrpc', () => {
  let servidor: ServidorFalso;
  let usuarios: UsuariosGrpc;

  beforeAll(async () => {
    servidor = await levantarServidorFalso('usuarios');
    usuarios = new UsuariosGrpc(servidor.url);
    servidor.respuestas.RegistroUsuario = { token: 'tok', usuario };
    servidor.respuestas.Login = { token: 'tok', usuario };
    for (const rpc of [
      'ObtenerUsuario',
      'AgregarRamosTutor',
      'QuitarRamoTutor',
      'ReactivarRamoTutor',
    ]) {
      servidor.respuestas[rpc] = usuario;
    }
    servidor.respuestas.ObtenerUsuarios = { usuarios: [usuario] };
    servidor.respuestas.ListarRamos = { ramos: [usuario.ramos[0].ramo] };
    servidor.respuestas.ListarTutoresPorRamo = { tutores: [usuario] };
  });

  afterAll(async () => {
    usuarios.onModuleDestroy();
    await servidor.cerrar();
  });

  const ultima = () => servidor.llamadas.at(-1)!;

  it('usa los mensajes del contrato tal como vienen', async () => {
    const datos = { nombre: 'Ana', email: 'ana@uc.cl', password: 'p' };
    expect(await usuarios.registro(datos)).toEqual({ token: 'tok', usuario });
    expect(await usuarios.login({ email: 'ana@uc.cl', password: 'p' })).toEqual(
      { token: 'tok', usuario },
    );
    expect(await usuarios.obtenerUsuario('u-1')).toEqual(usuario);
    expect(await usuarios.obtenerUsuarios(['u-1', 'u-2'])).toEqual([usuario]);
    expect(ultima().req).toEqual({ ids: ['u-1', 'u-2'] });
    expect(await usuarios.listarRamos()).toEqual([
      { codigo: 'MAT1610', nombre: 'Cálculo I' },
    ]);
    expect(await usuarios.listarTutoresPorRamo('MAT1610')).toEqual([usuario]);
  });

  it('manda el formulario y los cambios de ramos con el usuario', async () => {
    const ramos = [
      {
        ramoCodigo: 'MAT1610',
        notaAprobacion: 6.5,
        periodoAprobacion: '2025-2',
      },
    ];
    await usuarios.agregarRamosTutor('u-1', ramos);
    expect(ultima().req).toEqual({ usuarioId: 'u-1', ramos });

    await usuarios.quitarRamoTutor('u-1', 'MAT1610');
    expect(ultima()).toMatchObject({
      metodo: 'QuitarRamoTutor',
      req: { usuarioId: 'u-1', ramoCodigo: 'MAT1610' },
    });
    await usuarios.reactivarRamoTutor('u-1', 'MAT1610');
    expect(ultima().metodo).toBe('ReactivarRamoTutor');
  });

  it('traduce un login fallido a 401', async () => {
    servidor.respuestas.Login = {
      code: status.UNAUTHENTICATED,
      details: 'email o contraseña incorrectos',
    };
    await expect(
      usuarios.login({ email: 'ana@uc.cl', password: 'mala' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
