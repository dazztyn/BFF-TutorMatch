import type { RespuestaAgente } from './agente.models';

export const AGENTE_PORT = Symbol('AGENTE_PORT');

export interface MensajeAgente {
  usuarioId: string;
  mensaje: string;
  // Sin él, el agente abre una conversación nueva y devuelve su id.
  conversacionId?: string;
}

// POST /agent/chat del contrato del agente (propuesta de Pablo).
export interface AgentePort {
  // autorizacion: la cabecera "Bearer <token>" del usuario, que el agente usa para llamar al BFF.
  chat(datos: MensajeAgente, autorizacion: string): Promise<RespuestaAgente>;
}
