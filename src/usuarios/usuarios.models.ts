import { Field, Float, ID, InputType, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Ramo {
  @Field({ description: 'Ej. "MAT1610"' })
  codigo: string;

  @Field()
  nombre: string;
}

@ObjectType({
  description: 'Un ramo en el que el usuario se inscribió como tutor',
})
export class RamoTutor {
  @Field(() => Ramo)
  ramo: Ramo;

  @Field({ description: 'false si el tutor lo quitó; puede reactivarlo' })
  activo: boolean;
}

@ObjectType()
export class Usuario {
  @Field(() => ID)
  id: string;

  @Field()
  nombre: string;

  @Field()
  email: string;

  @Field({
    description:
      'Verdadero si tiene al menos un ramo activo; solo decide qué portal ve',
  })
  esTutor: boolean;

  @Field(() => [RamoTutor])
  ramos: RamoTutor[];
}

@ObjectType({ description: 'Respuesta de registro y login' })
export class Acceso {
  @Field({ description: 'JWT para la cabecera Authorization' })
  token: string;

  @Field(() => Usuario)
  usuario: Usuario;
}

@InputType()
export class RegistroInput {
  @Field()
  nombre: string;

  @Field()
  email: string;

  @Field()
  password: string;
}

@InputType()
export class LoginInput {
  @Field()
  email: string;

  @Field()
  password: string;
}

@InputType({ description: 'Datos del formulario de verificación para un ramo' })
export class InscripcionRamoInput {
  @Field()
  ramoCodigo: string;

  @Field(() => Float, { description: 'Escala chilena, de 4.0 a 7.0' })
  notaAprobacion: number;

  @Field({ description: 'Año y semestre, ej. "2025-2"' })
  periodoAprobacion: string;
}
