import { status } from '@grpc/grpc-js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { levantarServidorFalso } from '../test/servidor-grpc-falso';
import { aDate, aExcepcion, aTimestamp, ClienteGrpc } from './grpc';

const error = (code: status) =>
  Object.assign(new Error('x'), {
    code,
    details: 'detalle',
    metadata: null,
  }) as any;

describe('grpc', () => {
  it('convierte fechas a Timestamp y de vuelta, con milisegundos', () => {
    const fecha = new Date('2030-12-02T11:10:00.123Z');
    const ts = aTimestamp(fecha);
    expect(ts).toEqual({
      seconds: Math.floor(fecha.getTime() / 1000),
      nanos: 123_000_000,
    });
    expect(aDate({ seconds: String(ts.seconds), nanos: ts.nanos })).toEqual(
      fecha,
    );
  });

  it.each([
    [status.NOT_FOUND, NotFoundException],
    [status.ALREADY_EXISTS, ConflictException],
    [status.FAILED_PRECONDITION, ConflictException],
    [status.PERMISSION_DENIED, ForbiddenException],
    [status.INVALID_ARGUMENT, BadRequestException],
    [status.UNAUTHENTICATED, UnauthorizedException],
    [status.UNAVAILABLE, ServiceUnavailableException],
    [status.DEADLINE_EXCEEDED, ServiceUnavailableException],
  ])('traduce el código gRPC %i', (code, Excepcion) => {
    expect(aExcepcion(error(code), 'Sesiones')).toBeInstanceOf(Excepcion);
  });

  it('dice qué servicio no responde y deja pasar los códigos desconocidos', () => {
    expect(aExcepcion(error(status.UNAVAILABLE), 'Material').message).toBe(
      'El servicio de Material no responde',
    );
    const interno = error(status.INTERNAL);
    expect(aExcepcion(interno, 'Material')).toBe(interno);
  });

  it('llama al servicio y traduce sus errores', async () => {
    const servidor = await levantarServidorFalso('usuarios');
    const cliente = new ClienteGrpc('usuarios', servidor.url);
    try {
      servidor.respuestas.ListarRamos = {
        ramos: [{ codigo: 'MAT1610', nombre: 'Cálculo I' }],
      };
      expect((await cliente.llamar('ListarRamos', {})).ramos).toHaveLength(1);

      servidor.respuestas.ObtenerUsuario = {
        code: status.NOT_FOUND,
        details: 'no está',
      };
      await expect(
        cliente.llamar('ObtenerUsuario', { id: 'x' }),
      ).rejects.toThrow(new NotFoundException('no está'));
    } finally {
      cliente.cerrar();
      await servidor.cerrar();
    }
  });
});
