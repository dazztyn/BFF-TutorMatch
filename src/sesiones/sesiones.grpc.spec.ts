import { status } from '@grpc/grpc-js';
import { ConflictException } from '@nestjs/common';
import {
  levantarServidorFalso,
  type ServidorFalso,
} from '../../test/servidor-grpc-falso';
import { aTimestamp } from '../grpc';
import { SesionesGrpc } from './sesiones.grpc';
import { EstadoSesion } from './sesiones.models';

const inicio = new Date('2030-12-02T11:10:00.000Z');
const fin = new Date('2030-12-02T12:40:00.000Z');
const sesionProto = {
  id: 's-1',
  tutorId: 't-1',
  estudianteId: 'e-1',
  ramoCodigo: 'MAT1610',
  inicio: aTimestamp(inicio),
  fin: aTimestamp(fin),
  estado: 'PENDIENTE',
  creadaEn: aTimestamp(inicio),
};
const bloqueProto = {
  id: 'c-1',
  tutorId: 't-1',
  ramoCodigo: 'MAT1610',
  inicio: aTimestamp(inicio),
  fin: aTimestamp(fin),
  libre: true,
};

describe('SesionesGrpc', () => {
  let servidor: ServidorFalso;
  let sesiones: SesionesGrpc;

  beforeAll(async () => {
    servidor = await levantarServidorFalso('sesiones');
    sesiones = new SesionesGrpc(servidor.url);
    for (const rpc of [
      'CrearSesion',
      'ObtenerSesion',
      'ConfirmarSesion',
      'CancelarSesion',
      'FinalizarSesion',
    ]) {
      servidor.respuestas[rpc] = sesionProto;
    }
    servidor.respuestas.ListarSesiones = { sesiones: [sesionProto] };
    servidor.respuestas.MarcarCasilla = bloqueProto;
    servidor.respuestas.ObtenerDisponibilidad = { bloques: [bloqueProto] };
    servidor.respuestas.BuscarDisponibilidad = { bloques: [bloqueProto] };
  });

  afterAll(async () => {
    sesiones.onModuleDestroy();
    await servidor.cerrar();
  });

  beforeEach(() => {
    servidor.llamadas.length = 0;
  });

  const ultima = () => servidor.llamadas.at(-1)!;

  it('traduce las sesiones del contrato a los modelos del BFF', async () => {
    const esperado = {
      id: 's-1',
      tutorId: 't-1',
      estudianteId: 'e-1',
      ramoCodigo: 'MAT1610',
      inicio,
      fin,
      estado: EstadoSesion.PENDIENTE,
      creadaEn: inicio,
    };
    expect(
      await sesiones.crear({
        tutorId: 't-1',
        estudianteId: 'e-1',
        ramoCodigo: 'MAT1610',
        inicio,
        fin,
      }),
    ).toEqual(esperado);
    expect(ultima().req.inicio).toEqual({
      seconds: String(aTimestamp(inicio).seconds),
      nanos: 0,
    });

    expect(await sesiones.obtener('s-1')).toEqual(esperado);
    expect(await sesiones.confirmar('s-1', 't-1')).toEqual(esperado);
    expect(ultima()).toMatchObject({
      metodo: 'ConfirmarSesion',
      req: { id: 's-1', usuarioId: 't-1' },
    });
    expect(await sesiones.cancelar('s-1', 'e-1')).toEqual(esperado);
    expect(await sesiones.finalizar('s-1', 't-1')).toEqual(esperado);
  });

  it('manda los filtros de la lista y omite las fechas que no vienen', async () => {
    expect(
      await sesiones.listar({ tutorId: 't-1', estado: EstadoSesion.PENDIENTE }),
    ).toHaveLength(1);
    expect(ultima().req).toMatchObject({
      tutorId: 't-1',
      estado: 'PENDIENTE',
      desde: null,
      hasta: null,
    });

    await sesiones.listar({ desde: inicio, hasta: fin });
    expect(ultima().req.desde).not.toBeNull();
  });

  it('traduce las casillas y manda el rango', async () => {
    const bloque = { ...bloqueProto, inicio, fin };
    expect(await sesiones.marcarCasilla('t-1', 'MAT1610', inicio)).toEqual(
      bloque,
    );
    expect(await sesiones.obtenerDisponibilidad('t-1', inicio, fin)).toEqual([
      bloque,
    ]);
    expect(await sesiones.buscarDisponibilidad('MAT1610', inicio, fin)).toEqual(
      [bloque],
    );
    expect(ultima().req).toMatchObject({ ramoCodigo: 'MAT1610' });

    await sesiones.desmarcarCasilla('c-1', 't-1');
    expect(ultima()).toMatchObject({
      metodo: 'DesmarcarCasilla',
      req: { id: 'c-1', tutorId: 't-1' },
    });
  });

  it('traduce los errores del servicio', async () => {
    servidor.respuestas.ObtenerSesion = {
      code: status.FAILED_PRECONDITION,
      details: 'transición inválida',
    };
    await expect(sesiones.obtener('s-1')).rejects.toThrow(
      new ConflictException('transición inválida'),
    );
  });
});
