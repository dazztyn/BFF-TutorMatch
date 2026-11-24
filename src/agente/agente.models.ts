import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType({
  description:
    'Algo que el agente hizo en el sistema, para refrescar esa vista',
})
export class AccionAgente {
  @Field({ description: 'Por ahora solo "sesion.creada"' })
  tipo: string;

  @Field(() => ID)
  id: string;
}

@ObjectType()
export class RespuestaAgente {
  @Field({
    description: 'Se manda de vuelta para seguir la misma conversación',
  })
  conversacionId: string;

  @Field()
  respuesta: string;

  @Field(() => [AccionAgente], {
    description: 'Vacía si el agente solo conversó',
  })
  acciones: AccionAgente[];
}

// Límites del contrato del agente; el BFF los valida antes de llamarlo.
export const MAXIMO_MENSAJE = 2000;
export const MAXIMO_CONVERSACION_ID = 128;
