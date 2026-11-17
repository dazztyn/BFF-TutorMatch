import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('GraphQL de sesiones (e2e)', () => {
  let app: INestApplication<App>;

  const gql = (query: string, usuarioId?: string) => {
    const peticion = request(app.getHttpServer()).post('/graphql');
    if (usuarioId) peticion.set('x-usuario-id', usuarioId);
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
    disponibilidad(tutorId: "tut-1", desde: "2030-12-02T00:00:00Z", hasta: "2030-12-07T00:00:00Z") { libre }
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

    const { body } = await gql(semana);
    expect(body.data.disponibilidad).toEqual([{ libre: false }]);
    expect(body.data.sesiones).toEqual([{ id }]);
  });

  it('traduce los errores a códigos de GraphQL', async () => {
    await gql(marcar, 'tut-1');
    await gql(crear, 'est-1');

    const { body: ocupada } = await gql(crear, 'est-2');
    expect(ocupada.errors[0].extensions.code).toBe('CONFLICT');

    const { body: noExiste } = await gql(`{ sesion(id: "nope") { id } }`);
    expect(noExiste.errors[0].extensions.code).toBe('NOT_FOUND');

    const { body: sinCabecera } = await gql(crear);
    expect(sinCabecera.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  afterEach(async () => {
    await app.close();
  });
});
