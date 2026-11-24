import {
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RespuestaAgente } from './agente.models';
import type { AgentePort, MensajeAgente } from './agente.port';

// Traduce los errores del agente; su cuerpo es { "error": "mensaje" }.
const aExcepcion = (status: number, mensaje: string): HttpException => {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return new BadRequestException(mensaje);
    case HttpStatus.TOO_MANY_REQUESTS:
      // Con statusCode en la respuesta, como las excepciones de Nest, para que formatError lo traduzca.
      return new HttpException(
        { statusCode: 429, message: mensaje, error: 'Too Many Requests' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    case HttpStatus.GATEWAY_TIMEOUT:
      return new GatewayTimeoutException(mensaje);
    default:
      // 503 (la IA no responde) y cualquier otro error del agente.
      return new ServiceUnavailableException(mensaje);
  }
};

// Adaptador real: llama al agente (Go, Pablo) por REST.
export class AgenteHttp implements AgentePort {
  constructor(
    private readonly url: string,
    // El agente puede encadenar varias llamadas a Gemini (90 s cada una): el plazo es largo.
    private readonly plazoMs: number,
  ) {}

  async chat(
    datos: MensajeAgente,
    autorizacion: string,
  ): Promise<RespuestaAgente> {
    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.url}/agent/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: autorizacion,
        },
        body: JSON.stringify(datos),
        signal: AbortSignal.timeout(this.plazoMs),
      });
    } catch {
      // Caído, sin conexión o fuera de plazo.
      throw new ServiceUnavailableException('El agente no responde');
    }
    if (!respuesta.ok) {
      const cuerpo = (await respuesta.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw aExcepcion(
        respuesta.status,
        cuerpo?.error ?? 'El agente no responde',
      );
    }
    return (await respuesta.json()) as RespuestaAgente;
  }
}
