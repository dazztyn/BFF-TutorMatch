# Plataforma de Tutorías — Contexto del proyecto

## Este repositorio

Este repo es el **BFF (NestJS + GraphQL)**. Aquí solo va código del BFF; el resto de la arquitectura es contexto.

- Tests: `npm run test:cov` (coverage ≥ 60%)
- Levantar en local: `npm run start:dev`

Proyecto 2 del curso de Arquitectura de Sistemas. Plataforma donde estudiantes reservan tutorías con otros estudiantes (tutores) que aprobaron el ramo. Arquitectura de microservicios en Kubernetes.

## Requisitos del curso (no negociables)

- Frontend → BFF por **GraphQL** (patrón Backend for Frontend, actúa como API Gateway).
- Al menos **2 protocolos** entre microservicios: usamos **gRPC** y **Kafka**.
- Los microservicios se comunican entre sí en ambos sentidos (ej. A → B por Kafka, B → A por gRPC).
- **Cada microservicio tiene su propia base de datos** (los motores pueden repetirse).
- Cuarto servicio: **MCP server** conectado a un modelo de IA en la nube, que funciona como agente. Se comunica con el BFF por **REST**.
- **Prohibido usar frameworks de Python** (ya se usó FastAPI en el proyecto 1).
- Cada servicio en **su propio repositorio**, dockerizado, con **pipeline de CI** (GitHub Actions).
- Todo el sistema desplegado en un **cluster de Kubernetes**.
- **Coverage mínimo 60%** (el pipeline debe fallar bajo ese umbral).

## Arquitectura

| Componente | Tecnología | Base de datos | Responsable |
|---|---|---|---|
| Frontend | por definir | — | compañero |
| BFF / API Gateway | NestJS (GraphQL) | — | **yo** |
| Usuarios | Go (por confirmar) | PostgreSQL | compañero |
| Sesiones | Java + Spring Boot | PostgreSQL | **yo** |
| Material y evaluaciones | .NET (por confirmar) | MongoDB | compañero |
| MCP server + agente | TypeScript (SDK oficial MCP) | — | compañero |

### Comunicación

- Frontend → BFF: GraphQL.
- BFF → Usuarios: gRPC.
- BFF → Sesiones: gRPC.
- BFF → Material: Kafka (comandos/eventos).
- BFF → MCP server: REST (`POST /agent/chat`).
- Sesiones → Usuarios: gRPC (validar que el tutor existe y aprobó el ramo).
- Sesiones → Material: Kafka (`sesion.creada`, `sesion.finalizada`, `sesion.cancelada`).
- Material → Sesiones: gRPC (verificar que la sesión finalizó y que el estudiante participó antes de aceptar una evaluación).

### Agente (MCP)

El MCP server expone tools que llaman a los servicios (buscar tutores, ver disponibilidad, crear reserva, generar quiz desde material). El loop del agente con el LLM en la nube vive en el mismo servicio. Caso de uso principal: "Necesito ayuda con Cálculo II el jueves en la tarde" → busca tutores, propone horarios y crea la reserva.

## Servicio de Sesiones (Spring Boot)

- Responsable de agenda, disponibilidad de tutores y ciclo de vida de una sesión: `PENDIENTE → CONFIRMADA → FINALIZADA` o `CANCELADA`.
- PostgreSQL con migraciones Flyway. Los choques de horario de un tutor se impiden en la base de datos con un `EXCLUDE USING gist (tutor_id WITH =, horario WITH &&)` sobre un `TSTZRANGE` (requiere `btree_gist`), aplicado solo a sesiones `PENDIENTE` o `CONFIRMADA`.
- Tablas iniciales: `sesiones` (id, tutor_id, estudiante_id, ramo_codigo, horario, estado, creada_en) y `disponibilidad` (id, tutor_id, dia, hora_ini, hora_fin).
- Stack: Spring Data JPA, servidor y cliente gRPC, Spring Kafka, tests con JUnit + Testcontainers (Postgres y Kafka reales).

## BFF (NestJS)

- Resolvers GraphQL que traducen a llamadas gRPC, eventos Kafka y REST al MCP.
- Mientras un servicio de un compañero no esté listo, usar mocks del cliente gRPC.
- Es el punto que define los contratos del sistema: cualquier cambio de contrato se coordina con el equipo.

### Estado actual

- Stack: Node 24, NestJS 12 (ESM), TypeScript 6, Apollo Server 5, oxlint, Jest 30.
- GraphQL **code-first**: el esquema se genera desde los modelos y se versiona en `schema.gql` (no editarlo a mano).
- Patrón puerto/adaptador por servicio: `src/sesiones/` tiene el puerto (`SESIONES_PORT` / `SesionesPort`), dos adaptadores (`SesionesGrpc`, real, con `@grpc/grpc-js` + `@grpc/proto-loader`; `SesionesMock`, en memoria), modelos GraphQL y resolver. El adaptador se elige solo en `sesiones.module.ts`: gRPC si existe la variable `SESIONES_GRPC_URL` (ej. `localhost:9090`), si no el mock.
- Usuario actual: decorador `@UsuarioId()` que lee la cabecera `x-usuario-id` (temporal, sin autenticación, hasta que exista el login de Usuarios).
- Aún no hay módulos de Usuarios, Material (Kafka) ni Agente (REST).

### Aviso para el frontend (leer antes de manejar errores)

Cuando un compañero empiece el frontend, recordarle esto:

- Los errores de GraphQL **todavía no tienen un `extensions.code` confiable**: los 404 y 409 salen como `INTERNAL_SERVER_ERROR`. Solo 400 (`BAD_REQUEST`) y 403 (`FORBIDDEN`) salen bien.
- Para distinguir errores, usar **`extensions.status`** (404 no existe, 409 choque de horario o transición de estado inválida, 403 no participa, 400 datos inválidos, 503 servicio caído). Ese campo ya es correcto y se va a mantener.
- No escribir lógica que dependa de `code === 'INTERNAL_SERVER_ERROR'`: se va a corregir.
- Pendiente en el BFF: agregar `formatError` en `app.module.ts` para que `extensions.code` sea `NOT_FOUND`, `CONFLICT`, etc., y avisar al frontend cuando esté.
- El `stacktrace` que aparece en las respuestas es solo de desarrollo; en Kubernetes se oculta con `NODE_ENV=production`.
- Las mutations de sesiones (`crearSesion`, `confirmarSesion`, `cancelarSesion`, `finalizarSesion`) requieren la cabecera `x-usuario-id` (temporal, hasta que exista el login); sin ella responden 401.

## Contratos

- Los `.proto` vivirán en un repo aparte (`contracts`) que cada servicio incluya como submódulo o copie en el build.
- Mientras ese repo no exista, `proto/sesiones.proto` vive en este repo y se copia idéntico en el servicio de Sesiones (`src/main/protobuf/sesiones.proto`). Si cambia uno, cambiar el otro.
- `sesiones.proto` (paquete `tutorias.sesiones.v1`): `CrearSesion`, `ObtenerSesion`, `ListarSesiones`, `ConfirmarSesion`, `CancelarSesion`, `FinalizarSesion`, `ObtenerDisponibilidad` (BFF) y `VerificarParticipacion` (Material). Los errores viajan como códigos de estado gRPC (`NOT_FOUND`, `ALREADY_EXISTS`, `FAILED_PRECONDITION`, `PERMISSION_DENIED`, `INVALID_ARGUMENT`).
- Falta: `.proto` de Usuarios y tópicos/payloads de Kafka documentados.
- Formato de mensajes Kafka: JSON con `eventId`, `type`, `occurredAt` y `payload`.

## Convenciones

- Comentarios y documentación en español.
- Cada repo: `Dockerfile`, `.github/workflows/ci.yml` con tests + coverage ≥ 60%, y manifiestos de Kubernetes.

## Flujo de trabajo con git

- Puedes crear ramas y cambiarte entre ellas (`git checkout -b`, `git switch`).
- Aplica los cambios **solo en local**: edita archivos, pero **nunca hagas `git commit`, `git push`, `git merge` ni `git rebase`**.
- Yo reviso los cambios en el IDE y hago los commits y el push.
- Al terminar una tarea, resume qué archivos cambiaste y propón un mensaje de commit en español, para que yo lo use si me sirve.

## Orden de desarrollo

Primero un servicio **funcional**, después la calidad:

1. **Funcionalidad:** que el servicio levante, se conecte a su base de datos y responda sus endpoints o RPC de punta a punta. Probar a mano (grpcurl, GraphQL Playground, Postman).
2. **Tests:** recién cuando lo funcional esté estable, escribir tests unitarios y de integración hasta superar el 60% de coverage.
3. **Docker y pipeline:** `Dockerfile` y workflow de GitHub Actions con el umbral de coverage.
4. **Kubernetes:** manifiestos y despliegue en el cluster.

Mientras estemos en la etapa 1, no escribas tests ni configures el pipeline salvo que te lo pida, pero escribe el código de forma testeable (inyección de dependencias, lógica separada de los adaptadores gRPC/Kafka/DB).

## Próximos pasos

1. Contratos: ✅ `sesiones.proto` y esquema GraphQL de sesiones. Pendiente: `.proto` de Usuarios y tópicos de Kafka, revisados con el equipo.
2. Servicio de Sesiones funcional: ✅ Flyway, JPA, servidor gRPC y productor Kafka. Pendiente: cliente gRPC a Usuarios (validar tutor y ramo aprobado) y probar a mano de punta a punta.
3. BFF funcional: ✅ resolvers GraphQL y adaptador gRPC hacia Sesiones (probado contra un servidor gRPC falso). Pendiente: probarlo de punta a punta contra Sesiones real.
4. Tests de ambos hasta coverage ≥ 60%.
5. Dockerfile y pipeline de cada repo.