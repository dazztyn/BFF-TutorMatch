import { Module } from '@nestjs/common';
import { AgenteHttp } from './agente.http';
import { AgenteMock } from './agente.mock';
import { AGENTE_PORT } from './agente.port';
import { AgenteResolver } from './agente.resolver';

@Module({
  providers: [
    AgenteResolver,
    // Único punto donde se elige el adaptador: REST si hay URL, si no el mock.
    {
      provide: AGENTE_PORT,
      useFactory: () => {
        const url = process.env.AGENTE_URL;
        return url
          ? new AgenteHttp(
              url,
              Number(process.env.AGENTE_TIMEOUT_MS) || 120_000,
            )
          : new AgenteMock();
      },
    },
  ],
})
export class AgenteModule {}
