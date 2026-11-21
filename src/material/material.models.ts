import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

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
