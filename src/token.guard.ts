import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { usuarioDeCabecera } from './jwt';

// Para REST: rechaza con 401 antes de que corran los interceptores, así una subida sin
// token no alcanza a recibir el archivo completo.
@Injectable()
export class TokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    usuarioDeCabecera(ctx.switchToHttp().getRequest().headers.authorization);
    return true;
  }
}
