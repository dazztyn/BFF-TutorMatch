import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { MaterialModule } from './material/material.module';
import { SesionesModule } from './sesiones/sesiones.module';
import { UsuariosModule } from './usuarios/usuarios.module';

// Apollo solo traduce 400, 401 y 403; el resto de las excepciones HTTP de Nest saldrían como INTERNAL_SERVER_ERROR.
const CODIGOS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  503: 'SERVICE_UNAVAILABLE',
};

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // Code-first: el esquema se genera desde los modelos y se versiona en schema.gql.
      autoSchemaFile: 'schema.gql',
      sortSchema: true,
      formatError: (error) => {
        const original = error.extensions?.originalError as
          { statusCode?: number } | undefined;
        const codigo = CODIGOS[original?.statusCode ?? 0];
        return codigo
          ? { ...error, extensions: { ...error.extensions, code: codigo } }
          : error;
      },
    }),
    SesionesModule,
    UsuariosModule,
    MaterialModule,
  ],
})
export class AppModule {}
