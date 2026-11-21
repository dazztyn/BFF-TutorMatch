import {
  Field,
  Float,
  ID,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';

export enum TipoMaterial {
  ARCHIVO = 'ARCHIVO',
  AVISO = 'AVISO',
}
registerEnumType(TipoMaterial, { name: 'TipoMaterial' });

@ObjectType({ description: 'Datos de un archivo guardado, sin los bytes' })
export class Archivo {
  @Field()
  nombre: string;

  @Field({ description: '"application/pdf", "image/png" o "image/jpeg"' })
  tipoMime: string;

  @Field(() => Int)
  tamanoBytes: number;
}

@ObjectType()
export class Material {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { description: 'Dueño del material' })
  tutorId: string;

  @Field()
  ramoCodigo: string;

  @Field(() => TipoMaterial)
  tipo: TipoMaterial;

  @Field()
  titulo: string;

  @Field(() => String, { nullable: true, description: 'Solo en AVISO' })
  texto: string | null;

  @Field(() => Archivo, {
    nullable: true,
    description: 'Solo en ARCHIVO; se descarga con GET /archivos/:id',
  })
  archivo: Archivo | null;

  @Field()
  creadoEn: Date;
}

@ObjectType({
  description:
    'Evaluación pública de un tutor: sin quién la escribió ni de qué sesión es',
})
export class EvaluacionAnonima {
  @Field()
  ramoCodigo: string;

  @Field(() => Int, { description: 'Entero de 1 a 5' })
  nota: number;

  @Field({ description: 'Vacío si el alumno no comentó' })
  comentario: string;

  @Field()
  creadaEn: Date;
}

@ObjectType({
  description: 'Una evaluación vista por el alumno que la escribió',
})
export class EvaluacionPropia {
  @Field(() => ID)
  sesionId: string;

  @Field(() => ID)
  tutorId: string;

  @Field()
  ramoCodigo: string;

  @Field(() => Int)
  nota: number;

  @Field()
  comentario: string;

  @Field()
  creadaEn: Date;
}

@ObjectType()
export class EvaluacionesTutor {
  @Field(() => Float, { description: '0 si el tutor no tiene evaluaciones' })
  promedio: number;

  @Field(() => Int)
  cantidad: number;

  @Field(() => [EvaluacionAnonima], {
    description: 'De la más nueva a la más antigua',
  })
  evaluaciones: EvaluacionAnonima[];
}

// Promedio y cantidad de evaluaciones de un tutor, para el buscador.
export interface ResumenTutor {
  tutorId: string;
  promedio: number;
  cantidad: number;
}
