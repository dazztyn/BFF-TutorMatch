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

  const crear = `mutation {
    crearSesion(input: {
      tutorId: "tut-1", ramoCodigo: "MAT1620",
      inicio: "2026-12-03T18:00:00Z", fin: "2026-12-03T19:00:00Z"
    }) { id estado estudianteId inicio }
  }`;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('crea una sesión, la confirma y la lista', async () => {
    const { body: creada } = await gql(crear, 'est-1');
    expect(creada.data.crearSesion).toMatchObject({
      estado: 'PENDIENTE',
      estudianteId: 'est-1',
      inicio: '2026-12-03T18:00:00.000Z',
    });
    const { id } = creada.data.crearSesion;

    const { body: confirmada } = await gql(
      `mutation { confirmarSesion(id: "${id}") { estado } }`,
      'tut-1',
    );
    expect(confirmada.data.confirmarSesion.estado).toBe('CONFIRMADA');

    const { body: lista } = await gql(
      `{ sesiones(tutorId: "tut-1") { id } disponibilidad(tutorId: "tut-1") { dia } }`,
    );
    expect(lista.data.sesiones).toEqual([{ id }]);
    expect(lista.data.disponibilidad).toHaveLength(2);
  });

  it('rechaza una mutación sin la cabecera x-usuario-id', async () => {
    const { body } = await gql(crear);
    expect(body.data).toBeNull();
    expect(body.errors[0].message).toBe('Falta la cabecera x-usuario-id');
  });

  afterEach(async () => {
    await app.close();
  });
});
