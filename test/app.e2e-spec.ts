import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import jwt from 'jsonwebtoken';
import { AppModule } from './../src/app.module';
import { firmarToken } from './../src/jwt';

describe('GraphQL del BFF (e2e)', () => {
  let app: INestApplication<App>;

  // usuario: id al que se le firma un token, o un token ya armado con "Bearer ".
  const gql = (query: string, usuario?: string) => {
    const peticion = request(app.getHttpServer()).post('/graphql');
    if (usuario) {
      peticion.set(
        'Authorization',
        usuario.startsWith('Bearer ')
          ? usuario
          : `Bearer ${firmarToken(usuario)}`,
      );
    }
    return peticion.send({ query }).expect(200);
  };

  // Lunes 2 de diciembre de 2030, bloque A (08:10 en Chile = 11:10 UTC).
  const marcar = `mutation {
    marcarCasilla(ramoCodigo: "MAT1610", inicio: "2030-12-02T11:10:00Z") { id libre fin }
  }`;
  const crear = `mutation {
    crearSesion(input: {
      tutorId: "tut-1", ramoCodigo: "MAT1610",
      inicio: "2030-12-02T11:10:00Z"
    }) { id estado estudianteId inicio }
  }`;
  const semana = `{
    disponibilidad(tutorId: "tut-1", desde: "2030-12-02T00:00:00Z", hasta: "2030-12-07T00:00:00Z") { libre tutor { id } }
    sesiones(tutorId: "tut-1", estado: CONFIRMADA, desde: "2030-12-02T00:00:00Z", hasta: "2030-12-07T00:00:00Z") { id }
  }`;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('marca una casilla, la reserva, la confirma y arma la semana del tutor', async () => {
    const { body: marcada } = await gql(marcar, 'tut-1');
    expect(marcada.data.marcarCasilla).toMatchObject({
      libre: true,
      fin: '2030-12-02T12:40:00.000Z',
    });

    const { body: creada } = await gql(crear, 'est-1');
    expect(creada.data.crearSesion).toMatchObject({
      estado: 'PENDIENTE',
      estudianteId: 'est-1',
    });
    const { id } = creada.data.crearSesion;

    const { body: confirmada } = await gql(
      `mutation { confirmarSesion(id: "${id}") { estado } }`,
      'tut-1',
    );
    expect(confirmada.data.confirmarSesion.estado).toBe('CONFIRMADA');

    const { body } = await gql(semana, 'tut-1');
    // tut-1 no está registrado en el mock de Usuarios: el tutor viene null.
    expect(body.data.disponibilidad).toEqual([{ libre: false, tutor: null }]);
    expect(body.data.sesiones).toEqual([{ id }]);
  });

  it('traduce los errores a códigos de GraphQL', async () => {
    await gql(marcar, 'tut-1');
    await gql(crear, 'est-1');

    const { body: ocupada } = await gql(crear, 'est-2');
    expect(ocupada.errors[0].extensions.code).toBe('CONFLICT');

    const { body: noExiste } = await gql(
      `{ sesion(id: "nope") { id } }`,
      'est-1',
    );
    expect(noExiste.errors[0].extensions.code).toBe('NOT_FOUND');

    const { body: sinCabecera } = await gql(crear);
    expect(sinCabecera.errors[0].extensions.code).toBe('UNAUTHENTICATED');

    const { body: sinToken } = await gql(semana);
    expect(sinToken.errors[0].extensions.code).toBe('UNAUTHENTICATED');

    const { body: ajenas } = await gql(semana, 'est-2');
    expect(ajenas.errors[0].extensions.code).toBe('FORBIDDEN');

    const ajeno = jwt.sign({ sub: 'est-1' }, 'otro-secreto');
    const { body: firmaAjena } = await gql(crear, `Bearer ${ajeno}`);
    expect(firmaAjena.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('se registra, inicia sesión y usa el token', async () => {
    const { body: registro } = await gql(`mutation {
      registro(input: { nombre: "Ana", email: "ana@uc.cl", password: "secreta123" }) { usuario { id } }
    }`);
    const { id } = registro.data.registro.usuario;

    const { body: login } = await gql(`mutation {
      login(input: { email: "ana@uc.cl", password: "secreta123" }) { token }
    }`);
    const { body } = await gql(
      `{ yo { id esTutor } }`,
      `Bearer ${login.data.login.token}`,
    );
    expect(body.data.yo).toEqual({ id, esTutor: false });
  });

  it('conversa con el agente solo con token y valida el largo del mensaje', async () => {
    const chat = (mensaje: string) =>
      `mutation { chatAgente(mensaje: "${mensaje}") { conversacionId respuesta acciones { tipo id } } }`;

    const { body: sinToken } = await gql(chat('hola'));
    expect(sinToken.errors[0].extensions.code).toBe('UNAUTHENTICATED');

    const { body: vacio } = await gql(chat(' '), 'est-1');
    expect(vacio.errors[0].extensions.code).toBe('BAD_REQUEST');

    const { body } = await gql(chat('Necesito ayuda con Cálculo II'), 'est-1');
    expect(body.data.chatAgente.acciones).toEqual([]);
    expect(body.data.chatAgente.conversacionId).toBeTruthy();
  });

  afterEach(async () => {
    await app.close();
  });
});
