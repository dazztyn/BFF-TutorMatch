import { BadRequestException } from '@nestjs/common';
import { AgenteMock } from './agente.mock';
import type { AgentePort } from './agente.port';
import { AgenteResolver } from './agente.resolver';

const ctx = { req: { headers: { authorization: 'Bearer abc' } } };

describe('AgenteResolver', () => {
  it('manda al agente el usuario del token y reenvía la misma cabecera', async () => {
    const agente: AgentePort = {
      chat: jest.fn().mockResolvedValue({
        conversacionId: 'conv-1',
        respuesta: 'hola',
        acciones: [],
      }),
    };
    const resolver = new AgenteResolver(agente);

    await resolver.chatAgente('Necesito ayuda', 'u-del-token', ctx, 'conv-1');
    expect(agente.chat).toHaveBeenCalledWith(
      {
        usuarioId: 'u-del-token',
        mensaje: 'Necesito ayuda',
        conversacionId: 'conv-1',
      },
      'Bearer abc',
    );
  });

  it('valida los largos sin llamar al agente', async () => {
    const agente: AgentePort = { chat: jest.fn() };
    const resolver = new AgenteResolver(agente);
    for (const [mensaje, conversacionId] of [
      ['', undefined],
      ['   ', undefined],
      ['x'.repeat(2001), undefined],
      ['hola', 'c'.repeat(129)],
    ]) {
      expect(() =>
        resolver.chatAgente(mensaje as string, 'u-1', ctx, conversacionId),
      ).toThrow(BadRequestException);
    }
    expect(agente.chat).not.toHaveBeenCalled();
  });
});

describe('AgenteMock', () => {
  it('responde sin acciones y conserva o crea el id de la conversación', async () => {
    const mock = new AgenteMock();
    const nueva = await mock.chat({ usuarioId: 'u-1', mensaje: 'hola' });
    expect(nueva.acciones).toEqual([]);
    expect(nueva.conversacionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      (
        await mock.chat({
          usuarioId: 'u-1',
          mensaje: 'hola',
          conversacionId: 'c-1',
        })
      ).conversacionId,
    ).toBe('c-1');
  });
});
