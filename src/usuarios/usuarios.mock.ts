import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  Acceso,
  InscripcionRamoInput,
  LoginInput,
  Ramo,
  RegistroInput,
  Usuario,
} from './usuarios.models';
import { firmarToken } from '../jwt';
import type { UsuariosPort } from './usuarios.port';

// Catálogo de ejemplo; el real lo carga el servicio de Usuarios.
const CATALOGO: Ramo[] = [
  { codigo: 'MAT1610', nombre: 'Cálculo II' },
  { codigo: 'MAT1620', nombre: 'Cálculo III' },
  { codigo: 'FIS1514', nombre: 'Electricidad y Magnetismo' },
  { codigo: 'IIC2233', nombre: 'Programación Avanzada' },
];

interface Cuenta {
  id: string;
  nombre: string;
  email: string;
  // "sal:hash" en hexadecimal (scrypt); la contraseña nunca se guarda en texto plano.
  password: string;
  // ramo_codigo → activo. Quitar un ramo lo marca inactivo para poder reactivarlo.
  ramos: Map<string, boolean>;
}

const hashear = (password: string): string => {
  const sal = randomBytes(16);
  return `${sal.toString('hex')}:${scryptSync(password, sal, 32).toString('hex')}`;
};

const coincide = (password: string, guardado: string): boolean => {
  const [sal, hash] = guardado.split(':');
  return timingSafeEqual(
    scryptSync(password, Buffer.from(sal, 'hex'), 32),
    Buffer.from(hash, 'hex'),
  );
};

// Reemplazo en memoria del servicio de Usuarios, con las reglas del contrato;
// los datos se pierden al reiniciar.
@Injectable()
export class UsuariosMock implements UsuariosPort {
  private readonly cuentas = new Map<string, Cuenta>();

  async registro({ nombre, email, password }: RegistroInput): Promise<Acceso> {
    if (!nombre.trim() || !/^[^@\s]+@[^@\s]+$/.test(email) || !password) {
      throw new BadRequestException(
        'Faltan el nombre o la contraseña, o el email no es válido',
      );
    }
    if (this.porEmail(email)) {
      throw new ConflictException('Ya hay un usuario con ese email');
    }
    const cuenta: Cuenta = {
      id: randomUUID(),
      nombre: nombre.trim(),
      email: email.trim(),
      password: hashear(password),
      ramos: new Map(),
    };
    this.cuentas.set(cuenta.id, cuenta);
    return this.acceso(cuenta);
  }

  async login({ email, password }: LoginInput): Promise<Acceso> {
    const cuenta = this.porEmail(email);
    if (!cuenta || !coincide(password, cuenta.password)) {
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }
    return this.acceso(cuenta);
  }

  async obtenerUsuario(id: string): Promise<Usuario> {
    return aUsuario(this.cuenta(id));
  }

  async obtenerUsuarios(ids: string[]): Promise<Usuario[]> {
    return ids.flatMap((id) => {
      const cuenta = this.cuentas.get(id);
      return cuenta ? [aUsuario(cuenta)] : [];
    });
  }

  async agregarRamosTutor(
    usuarioId: string,
    ramos: InscripcionRamoInput[],
  ): Promise<Usuario> {
    const cuenta = this.cuenta(usuarioId);
    if (!ramos.length) throw new BadRequestException('Faltan los ramos');
    // Se valida todo antes de inscribir nada: todo o nada.
    for (const r of ramos) {
      if (!CATALOGO.some((c) => c.codigo === r.ramoCodigo)) {
        throw new NotFoundException(
          `El ramo ${r.ramoCodigo} no está en el catálogo`,
        );
      }
      if (cuenta.ramos.has(r.ramoCodigo)) {
        throw new ConflictException(
          `Ya estás inscrito en ${r.ramoCodigo}; si lo quitaste, reactívalo`,
        );
      }
      if (r.notaAprobacion < 4 || r.notaAprobacion > 7) {
        throw new BadRequestException('La nota debe estar entre 4.0 y 7.0');
      }
      if (!/^\d{4}-[12]$/.test(r.periodoAprobacion)) {
        throw new BadRequestException(
          'El periodo debe tener la forma "2025-2"',
        );
      }
    }
    if (new Set(ramos.map((r) => r.ramoCodigo)).size !== ramos.length) {
      throw new BadRequestException('Hay ramos repetidos');
    }
    for (const r of ramos) cuenta.ramos.set(r.ramoCodigo, true);
    return aUsuario(cuenta);
  }

  quitarRamoTutor(usuarioId: string, ramoCodigo: string): Promise<Usuario> {
    return this.cambiarRamo(usuarioId, ramoCodigo, false);
  }

  reactivarRamoTutor(usuarioId: string, ramoCodigo: string): Promise<Usuario> {
    return this.cambiarRamo(usuarioId, ramoCodigo, true);
  }

  async listarRamos(): Promise<Ramo[]> {
    return CATALOGO;
  }

  async listarTutoresPorRamo(ramoCodigo: string): Promise<Usuario[]> {
    return [...this.cuentas.values()]
      .filter((c) => c.ramos.get(ramoCodigo) === true)
      .map(aUsuario);
  }

  // Quitar un ramo ya inactivo o reactivar uno activo no hace nada y no es error.
  private async cambiarRamo(
    usuarioId: string,
    ramoCodigo: string,
    activo: boolean,
  ): Promise<Usuario> {
    const cuenta = this.cuenta(usuarioId);
    if (!cuenta.ramos.has(ramoCodigo)) {
      throw new NotFoundException(`No estás inscrito en ${ramoCodigo}`);
    }
    cuenta.ramos.set(ramoCodigo, activo);
    return aUsuario(cuenta);
  }

  private acceso(cuenta: Cuenta): Acceso {
    // Firmado igual que Usuarios, así pasar al servicio real no cambia la verificación.
    return { token: firmarToken(cuenta.id), usuario: aUsuario(cuenta) };
  }

  private cuenta(id: string): Cuenta {
    const cuenta = this.cuentas.get(id);
    if (!cuenta) throw new NotFoundException(`No existe el usuario ${id}`);
    return cuenta;
  }

  private porEmail(email: string): Cuenta | undefined {
    const buscado = email.trim().toLowerCase();
    return [...this.cuentas.values()].find(
      (c) => c.email.toLowerCase() === buscado,
    );
  }
}

// es_tutor se calcula siempre desde los ramos activos, así nunca los contradice.
const aUsuario = (c: Cuenta): Usuario => ({
  id: c.id,
  nombre: c.nombre,
  email: c.email,
  esTutor: [...c.ramos.values()].some(Boolean),
  ramos: [...c.ramos].map(([codigo, activo]) => ({
    ramo: CATALOGO.find((r) => r.codigo === codigo)!,
    activo,
  })),
});
