import { UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { firmarToken, usuarioDeCabecera, verificarToken } from './jwt';

// Secreto de desarrollo que usa src/jwt.ts cuando no hay JWT_SECRET.
const DEV = 'secreto-de-desarrollo-tutormatch';

describe('jwt', () => {
  it('firma con HS256, sub y vencimiento de 24 horas', () => {
    const token = firmarToken('u-1');
    const { header, payload } = jwt.decode(token, { complete: true }) as any;
    expect(header.alg).toBe('HS256');
    expect(payload.sub).toBe('u-1');
    expect(payload.exp - payload.iat).toBe(24 * 60 * 60);
    expect(verificarToken(token)).toBe('u-1');
  });

  it.each([
    ['vencido', jwt.sign({ sub: 'u-1', exp: 1 }, DEV)],
    ['firmado con otro secreto', jwt.sign({ sub: 'u-1' }, 'otro')],
    ['sin sub', jwt.sign({}, DEV)],
    [
      'con otro algoritmo',
      jwt.sign({ sub: 'u-1' }, DEV, { algorithm: 'HS512' }),
    ],
    ['sin firma', jwt.sign({ sub: 'u-1' }, null, { algorithm: 'none' })],
    ['que no es un JWT', 'basura'],
  ])('rechaza un token %s', (_, token) => {
    expect(() => verificarToken(token)).toThrow(UnauthorizedException);
  });

  it('lee el usuario de "Authorization: Bearer <token>"', () => {
    expect(usuarioDeCabecera(`Bearer ${firmarToken('u-2')}`)).toBe('u-2');
    for (const cabecera of [
      undefined,
      '',
      firmarToken('u-2'),
      'Basic abc',
      42,
    ]) {
      expect(() => usuarioDeCabecera(cabecera)).toThrow(
        'Falta la cabecera Authorization: Bearer <token>',
      );
    }
  });

  describe('JWT_SECRET', () => {
    const original = { ...process.env };
    afterEach(() => {
      process.env = { ...original };
    });

    const cargar = () => {
      let modulo!: typeof import('./jwt');
      jest.isolateModules(() => {
        modulo = require('./jwt');
      });
      return modulo;
    };

    it('es obligatorio en producción', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      expect(cargar).toThrow('Falta la variable JWT_SECRET');
    });

    it('se usa cuando está definido', () => {
      process.env.JWT_SECRET = 'secreto-de-prueba';
      const { firmarToken: firmar } = cargar();
      expect(jwt.verify(firmar('u-3'), 'secreto-de-prueba').sub).toBe('u-3');
    });
  });
});
