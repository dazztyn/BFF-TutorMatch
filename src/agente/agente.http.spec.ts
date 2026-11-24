import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AgenteHttp } from './agente.http';

// Agente falso: responde lo que diga `respuesta` y guarda la última petición recibida.
let respuesta: { status: number; cuerpo?: object; colgar?: boolean };
let recibida: { req: IncomingMessage; cuerpo: any };
let servidor: Server;
let url: string;

const datos = {
  usuarioId: 'u-1',
  mensaje: 'Necesito ayuda con Cálculo II',
  conversacionId: 'conv-1',
};

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let texto = '';
    req.on('data', (parte) => (texto += parte));
    req.on('end', () => {
      recibida = { req, cuerpo: JSON.parse(texto) };
      if (respuesta.colgar) return;
      res.writeHead(respuesta.status, { 'content-type': 'application/json' });
      res.end(
        respuesta.cuerpo ? JSON.stringify(respuesta.cuerpo) : 'no es json',
      );
    });
  });
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  servidor.closeAllConnections();
  await new Promise((listo) => servidor.close(listo));
});

describe('AgenteHttp', () => {
  const agente = () => new AgenteHttp(url, 2000);

  it('manda el cuerpo del contrato y reenvía la cabecera Authorization', async () => {
    const cuerpo = {
      conversacionId: 'conv-1',
      respuesta: 'Encontré dos tutores',
      acciones: [{ tipo: 'sesion.creada', id: 's-1' }],
    };
    respuesta = { status: 200, cuerpo };

    expect(await agente().chat(datos, 'Bearer abc')).toEqual(cuerpo);
    expect(recibida.req.method).toBe('POST');
    expect(recibida.req.url).toBe('/agent/chat');
    expect(recibida.req.headers.authorization).toBe('Bearer abc');
    expect(recibida.req.headers['content-type']).toBe('application/json');
    expect(recibida.cuerpo).toEqual(datos);
  });

  it.each([
    [HttpStatus.BAD_REQUEST, BadRequestException],
    [HttpStatus.TOO_MANY_REQUESTS, HttpException],
    [HttpStatus.SERVICE_UNAVAILABLE, ServiceUnavailableException],
    [HttpStatus.GATEWAY_TIMEOUT, GatewayTimeoutException],
    [HttpStatus.INTERNAL_SERVER_ERROR, ServiceUnavailableException],
  ])('traduce un %i del agente con su mensaje', async (status, Excepcion) => {
    respuesta = { status, cuerpo: { error: 'mensaje del agente' } };
    const error = await agente()
      .chat(datos, 'Bearer abc')
      .catch((e: HttpException) => e);
    expect(error).toBeInstanceOf(Excepcion);
    expect((error as HttpException).message).toBe('mensaje del agente');
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).getResponse()).toMatchObject({
        statusCode: 429,
      });
    }
  });

  it('usa un mensaje propio si el error no trae cuerpo JSON', async () => {
    respuesta = { status: 503 };
    await expect(agente().chat(datos, 'Bearer abc')).rejects.toThrow(
      'El agente no responde',
    );
  });

  it('responde 503 si el agente no contesta dentro del plazo', async () => {
    respuesta = { status: 200, colgar: true };
    await expect(
      new AgenteHttp(url, 150).chat(datos, 'Bearer abc'),
    ).rejects.toThrow(new ServiceUnavailableException('El agente no responde'));
  });

  it('responde 503 si el agente está caído', async () => {
    await expect(
      new AgenteHttp('http://127.0.0.1:1', 2000).chat(datos, 'Bearer abc'),
    ).rejects.toThrow(new ServiceUnavailableException('El agente no responde'));
  });
});
