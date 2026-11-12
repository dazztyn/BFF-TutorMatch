import {
  Field,
  ID,
  InputType,
  Int,
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

@ObjectType()
export class BloqueDisponibilidad {
  @Field(() => ID)
  tutorId: string;

  @Field(() => Int, {
    description: 'Día de la semana ISO: 1 = lunes ... 7 = domingo',
  })
  dia: number;

  @Field({ description: 'Hora local en formato "HH:mm"' })
  horaIni: string;

  @Field({ description: 'Hora local en formato "HH:mm"' })
  horaFin: string;
}

@InputType()
export class CrearSesionInput {
  @Field(() => ID)
  tutorId: string;

  @Field()
  ramoCodigo: string;

  @Field()
  inicio: Date;

  @Field()
  fin: Date;
}
