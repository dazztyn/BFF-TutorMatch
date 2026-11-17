import {
  Field,
  ID,
  InputType,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';

export enum EstadoSesion {
  PENDIENTE = 'PENDIENTE',
  CONFIRMADA = 'CONFIRMADA',
  FINALIZADA = 'FINALIZADA',
  CANCELADA = 'CANCELADA',
}
registerEnumType(EstadoSesion, { name: 'EstadoSesion' });

@ObjectType()
export class Sesion {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  tutorId: string;

  @Field(() => ID)
  estudianteId: string;

  @Field()
  ramoCodigo: string;

  @Field()
  inicio: Date;

  @Field()
  fin: Date;

  @Field(() => EstadoSesion)
  estado: EstadoSesion;

  @Field()
  creadaEn: Date;
}

@ObjectType({
  description:
    'Casilla de disponibilidad: un bloque de clase de 90 minutos para un ramo',
})
export class BloqueDisponibilidad {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  tutorId: string;

  @Field()
  ramoCodigo: string;

  @Field()
  inicio: Date;

  @Field()
  fin: Date;

  @Field({
    description: 'false si tiene encima una sesión PENDIENTE o CONFIRMADA',
  })
  libre: boolean;
}

// Una casilla y una sesión duran siempre un bloque de clase.
export const DURACION_BLOQUE_MS = 90 * 60 * 1000;

// El fin no se pide: el BFF lo calcula como inicio + 90 minutos.
@InputType()
export class CrearSesionInput {
  @Field(() => ID)
  tutorId: string;

  @Field()
  ramoCodigo: string;

  @Field({ description: 'Inicio de una casilla libre del tutor, en UTC' })
  inicio: Date;
}
