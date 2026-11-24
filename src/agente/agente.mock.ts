import { randomUUID } from 'node:crypto';
import type { RespuestaAgente } from './agente.models';
import type { AgentePort, MensajeAgente } from './agente.port';

// Reemplazo del agente para trabajar sin él (ni clave de Gemini): responde un texto fijo y no
// hace nada en el sistema.
export class AgenteMock implements AgentePort {
  async chat({ conversacionId }: MensajeAgente): Promise<RespuestaAgente> {
    return {
      conversacionId: conversacionId ?? randomUUID(),
      respuesta:
        'Soy el agente de prueba: el agente real no está conectado (falta AGENTE_URL).',
      acciones: [],
    };
  }
}
