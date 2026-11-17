import { UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';

// Mismo secreto que usa Usuarios para firmar (Secret de Kubernetes). Se lee al arrancar:
// sin él, en producción el BFF no levanta.
const leerSecreto = (): string => {
  const secreto = process.env.JWT_SECRET;
  if (secreto) return secreto;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Falta la variable JWT_SECRET');
  }
  // shortcut: secreto fijo solo fuera de producción; para probar contra Usuarios real, definir JWT_SECRET igual en los dos.
  return 'secreto-de-desarrollo-tutormatch';
};

const SECRETO = leerSecreto();

// Igual que Usuarios: HS256, id del usuario en "sub" y vencimiento en 24 horas.
export const firmarToken = (usuarioId: string): string =>
  jwt.sign({}, SECRETO, {
    algorithm: 'HS256',
    subject: usuarioId,
    expiresIn: '24h',
  });

// Devuelve el id del usuario; rechaza tokens con otra firma, otro algoritmo, vencidos o sin "sub".
export const verificarToken = (token: string): string => {
  try {
    const { sub } = jwt.verify(token, SECRETO, { algorithms: ['HS256'] });
    if (typeof sub === 'string' && sub) return sub;
  } catch {
    // Firma, formato o vencimiento inválidos: se responde igual que sin "sub".
  }
  throw new UnauthorizedException('Token inválido o vencido');
};
