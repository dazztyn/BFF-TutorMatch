import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { SesionesModule } from './sesiones/sesiones.module';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // Code-first: el esquema se genera desde los modelos y se versiona en schema.gql.
      autoSchemaFile: 'schema.gql',
      sortSchema: true,
    }),
    SesionesModule,
  ],
})
export class AppModule {}
