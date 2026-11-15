# Plataforma de Tutorías — Contexto del proyecto

## Este repositorio

Este repo es el **BFF (NestJS + GraphQL)**: `dazztyn/BFF-TutorMatch`. Aquí solo va código del BFF; el resto de la arquitectura es contexto.

Repos relacionados (todos en GitHub, cuenta `dazztyn`):

- `BFF-TutorMatch`: este repo.
- `Sesiones-TutorMatch`: servicio de Sesiones (Spring Boot), también a cargo de Vicente.
- `Contratos-TutorMatch`: contratos compartidos, incluido como submódulo en `contracts/`.

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
| Usuarios | Go | PostgreSQL | Pablo |
| Sesiones | Java + Spring Boot | PostgreSQL | **yo** |
| Material y evaluaciones | NestJS | MongoDB (por confirmar) | Ien |
| MCP server + agente | TypeScript (SDK oficial MCP) | — | Pablo |

### Comunicación

- Frontend → BFF: GraphQL.
- BFF → Usuarios: gRPC (además, login: Usuarios emite el JWT).
- BFF → Sesiones: gRPC.
- BFF → Material: gRPC (antes decía Kafka; el contrato `material.proto` lo cambió). El BFF ya no usa Kafka.
- BFF → MCP server: REST (`POST /agent/chat`).
- Sesiones → Usuarios: gRPC (`ValidarTutorRamo`: validar que el tutor tiene ese ramo activo).
- Sesiones → Material: Kafka (`sesion.creada`, `sesion.finalizada`, `sesion.cancelada`). Material arma con ellos su copia de las sesiones para decidir quién ve qué material.
- Material → Sesiones: gRPC (`VerificarParticipacion`, antes de aceptar una evaluación).
- Material → Usuarios: gRPC (`ValidarTutorRamo`, antes de aceptar material).
- Los archivos (PDF e imágenes) solo viajan entre el BFF y Material, por gRPC. Nunca por Kafka.
- Agente → Usuarios, Sesiones y Material: gRPC directo con los mismos `.proto` (sus tools no pasan por el BFF).

### Agente (MCP)

El MCP server expone tools que llaman a los servicios (buscar tutores, ver disponibilidad, crear reserva, generar quiz desde material). El loop del agente con el LLM en la nube vive en el mismo servicio. Caso de uso principal: "Necesito ayuda con Cálculo II el jueves en la tarde" → busca tutores, propone horarios y crea la reserva.

## Decisiones del flujo (acordadas el 2026-11-12)

Flujo del front definido hasta ahora: inicio de sesión con ingreso y registro de alumnos y de tutores; para el tutor, registro con sus ramos, pantalla principal con su semana y pantalla de archivos por ramo. El flujo del alumno todavía no está definido (buscar tutor, ver su semana, reservar, ver y cancelar sus sesiones, evaluar, ver material).

- **Un usuario puede ser alumno y tutor a la vez** (como en las ayudantías). Es tutor de un ramo cuando se inscribió en él y no lo ha quitado. El detalle está en `propuestas/usuarios.md` del repo de contratos (ver "Decisiones de Usuarios").
  - "Ingreso de alumnos" e "Ingreso de tutores" son el mismo login con dos portales; el front elige la pantalla según `es_tutor`. El registro de tutor es el registro normal más el formulario de inscripción de ramos.
  - El JWT no lleva rol. El permiso se revisa en cada acción: para marcar disponibilidad o crear una sesión en un ramo, Sesiones llama a `Usuarios.ValidarTutorRamo`.
  - Nadie puede reservarse a sí mismo, y un usuario no puede tener dos sesiones que se crucen, aunque en una sea alumno y en la otra tutor.
- **Disponibilidad semana a semana, por ramo:** el tutor marca casillas con fecha concreta para cada ramo que imparte. Una casilla marcada para un ramo deja de estar disponible para los otros (la base lo impide con un `EXCLUDE` sobre `tutor_id` y el rango, como en `sesiones`). Falta definir la duración de una casilla.
- **Reservar:** el alumno solo puede tomar una casilla disponible de ese tutor y ese ramo; `CrearSesion` lo valida.
- **Confirmación:** la reserva queda `PENDIENTE` hasta que el tutor la confirme. Rechazarla es cancelarla. Mientras está pendiente, el horario ya queda bloqueado para otros alumnos.
- **Desmarcar:** un horario con una sesión `PENDIENTE` o `CONFIRMADA` no se puede desmarcar (`FAILED_PRECONDITION`); primero se cancela la sesión.
- **Aviso al tutor sin websockets:** la pantalla principal del tutor consulta sus reservas pendientes al cargarse y cada 30 a 60 segundos (`pollInterval` de Apollo Client). El BFF solo necesita que la query `sesiones` filtre por estado. El BFF no consume Kafka ni expone suscripciones.
- **Fin y vencimiento automáticos:** una tarea programada en Sesiones, cada pocos minutos:
  - Una sesión `CONFIRMADA` cuyo `fin` ya pasó pasa a `FINALIZADA` y publica `sesion.finalizada`.
  - Una sesión `PENDIENTE` cuyo `inicio` ya pasó sin confirmación pasa a `CANCELADA` y publica `sesion.cancelada`.
  - Así el alumno siempre puede evaluar: Material solo acepta una evaluación (nota 1 a 5 y comentario) si `VerificarParticipacion` dice que la sesión está `FINALIZADA` y que el alumno participó.
- **Zona horaria:** todo en UTC (base de datos y contratos). La disponibilidad deja de usar "HH:mm". El front calcula la semana en hora de Chile y pide al BFF ese rango convertido a UTC.

### Decisiones de Usuarios (acordadas el 2026-11-15)

Detalle completo, esquema de PostgreSQL y `usuarios.proto` propuesto en `propuestas/usuarios.md` del repo de contratos. Lo que importa para el BFF:

- **Un solo `Login` y dos portales.** `Login` y `RegistroUsuario` devuelven el token y el usuario, con `es_tutor`. Por el portal de alumnos se entra siempre; por el de tutores, si `es_tutor` es falso, el front invita a inscribirse.
- **`es_tutor` es solo de lectura y solo decide la pantalla.** Usuarios lo guarda y lo recalcula (verdadero si tiene al menos un ramo activo). Los permisos de tutor los validan Sesiones y Material con `ValidarTutorRamo`.
- **Inscribirse como tutor es un formulario de verificación simulado:** por cada ramo, nota de aprobación (4.0 a 7.0) y periodo (ej. `2025-2`). Se aprueba en el acto si los datos son válidos (`AgregarRamosTutor`).
- **Un tutor puede quitar un ramo y reactivarlo** sin repetir el formulario (`QuitarRamoTutor`, `ReactivarRamoTutor`). Quitar un ramo no cancela sus sesiones ya reservadas; solo impide reservas nuevas.
- **RPC propuestos:** `RegistroUsuario`, `Login`, `ObtenerUsuario`, `ObtenerUsuarios` (en lote), `AgregarRamosTutor`, `QuitarRamoTutor`, `ReactivarRamoTutor`, `ListarRamos`, `ListarTutoresPorRamo`, `ValidarTutorRamo`. Usan los nombres de Pablo y reemplazan a los del borrador.

### Decisiones de Material (acordadas el 2026-11-15)

Detalle completo, modelo de MongoDB y `material.proto` propuesto en `propuestas/material.md` del repo de contratos. Lo que importa para el BFF:

- **Quién ve el material:** el tutor ve el suyo; un alumno ve el de un tutor en un ramo si tiene o tuvo una sesión no cancelada con ese tutor en ese ramo. Lo decide Material; el BFF no filtra.
- **Dos tipos de material:** `ARCHIVO` (PDF, PNG o JPEG, hasta 10 MB) y `AVISO` (solo texto). Solo el dueño puede eliminar.
- **Archivos por HTTP en el BFF, por gRPC hacia Material:** `POST /archivos` (multipart) para subir y `GET /archivos/:id` para descargar; el BFF valida el JWT, el tamaño y el tipo, y reenvía los bytes por gRPC. El cliente gRPC de Material en el BFF sube su límite de mensaje a 11 MB (por defecto es 4 MB). Los avisos, listar y eliminar van por GraphQL.
- **Evaluaciones anónimas:** nota de 1 a 5 y comentario opcional, una por sesión, sin editar ni borrar. Material nunca devuelve quién la escribió ni de qué sesión es, salvo al propio alumno (`ListarMisEvaluaciones`).
- **Evaluaciones públicas:** cualquier usuario con sesión iniciada ve el promedio, la cantidad y los comentarios de un tutor. El buscador muestra el promedio con `ObtenerResumenTutores`, en lote.
- **Sin quizzes por ahora:** el agente todavía no está definido.
- **RPC propuestos:** `SubirMaterial`, `ListarMaterial`, `DescargarArchivo`, `EliminarMaterial`, `Evaluar`, `ListarEvaluaciones`, `ListarMisEvaluaciones`, `ObtenerResumenTutores`.

## Servicio de Sesiones (Spring Boot)

- Responsable de agenda, disponibilidad de tutores y ciclo de vida de una sesión: `PENDIENTE → CONFIRMADA → FINALIZADA` o `CANCELADA`.
- PostgreSQL con migraciones Flyway. Los choques de horario de un tutor se impiden en la base de datos con un `EXCLUDE USING gist (tutor_id WITH =, horario WITH &&)` sobre un `TSTZRANGE` (requiere `btree_gist`), aplicado solo a sesiones `PENDIENTE` o `CONFIRMADA`.
- Tablas: `sesiones` (id, tutor_id, estudiante_id, ramo_codigo, inicio, fin, horario generado, estado, creada_en) y `disponibilidad`. La `disponibilidad` actual (id, tutor_id, dia, hora_ini, hora_fin: un patrón semanal sin ramo) se reemplaza por bloques con fecha concreta y ramo; ver "Decisiones del flujo".
- Stack: Spring Data JPA, servidor y cliente gRPC, Spring Kafka, tests con JUnit + Testcontainers (Postgres y Kafka reales).

## BFF (NestJS)

- Resolvers GraphQL que traducen a llamadas gRPC, eventos Kafka y REST al MCP.
- Mientras un servicio de un compañero no esté listo, usar mocks del cliente gRPC.
- Es el punto que define los contratos del sistema: cualquier cambio de contrato se coordina con el equipo.

### Estado actual

- Stack: Node 24, NestJS 12 (ESM), TypeScript 6, Apollo Server 5, oxlint, Jest 30.
- GraphQL **code-first**: el esquema se genera desde los modelos y se versiona en `schema.gql` (no editarlo a mano).
- Patrón puerto/adaptador por servicio: `src/sesiones/` tiene el puerto (`SESIONES_PORT` / `SesionesPort`), dos adaptadores (`SesionesGrpc`, real, con `@grpc/grpc-js` + `@grpc/proto-loader`; `SesionesMock`, en memoria), modelos GraphQL y resolver. El adaptador se elige solo en `sesiones.module.ts`: gRPC si existe la variable `SESIONES_GRPC_URL` (ej. `localhost:9090`), si no el mock.
- Usuario actual: decorador `@UsuarioId()` que lee la cabecera `x-usuario-id` (temporal, sin autenticación). Se reemplaza por el JWT de Usuarios (ver Contratos).
- El `.proto` de Sesiones se lee desde el submódulo `contracts/` (`contracts/proto/sesiones/v1/sesiones.proto`); la carpeta `proto/` del BFF ya no existe.
- Aún no hay módulos de Usuarios (gRPC), Material (gRPC) ni Agente (REST).

### Aviso para el frontend (leer antes de manejar errores)

Cuando un compañero empiece el frontend, recordarle esto:

- Los errores de GraphQL **todavía no tienen un `extensions.code` confiable**: los 404 y 409 salen como `INTERNAL_SERVER_ERROR`. Solo 400 (`BAD_REQUEST`) y 403 (`FORBIDDEN`) salen bien.
- Para distinguir errores, usar **`extensions.status`** (404 no existe, 409 choque de horario o transición de estado inválida, 403 no participa, 400 datos inválidos, 503 servicio caído). Ese campo ya es correcto y se va a mantener.
- No escribir lógica que dependa de `code === 'INTERNAL_SERVER_ERROR'`: se va a corregir.
- Pendiente en el BFF: agregar `formatError` en `app.module.ts` para que `extensions.code` sea `NOT_FOUND`, `CONFLICT`, etc., y avisar al frontend cuando esté.
- El `stacktrace` que aparece en las respuestas es solo de desarrollo; en Kubernetes se oculta con `NODE_ENV=production`.
- Las mutations de sesiones (`crearSesion`, `confirmarSesion`, `cancelarSesion`, `finalizarSesion`) requieren la cabecera `x-usuario-id` (temporal, hasta que exista el login); sin ella responden 401. Cuando entre el login, esa cabecera se reemplaza por `Authorization: Bearer <token>`.

## Contratos

Viven en el repo `Contratos-TutorMatch` (GitHub `dazztyn/Contratos-TutorMatch`), incluido como submódulo en `contracts/` en el BFF y en Sesiones. Su `README.md` tiene las convenciones y las reglas para cambiar un contrato; leerlo antes de tocar uno. Un cambio de contrato se hace por PR en ese repo, no en las copias de cada servicio.

| Archivo | Estado | Qué significa para el BFF |
|---|---|---|
| `proto/sesiones/v1/sesiones.proto` | Estable, implementado | Igual que antes; ya lo usa `SesionesGrpc`. |
| `proto/usuarios/v1/usuarios.proto` | BORRADOR, reemplazado por `propuestas/usuarios.md` | Registro, login (JWT), datos de usuario, ramos y búsqueda de tutores. |
| `proto/material/v1/material.proto` | BORRADOR, reemplazado por `propuestas/material.md` | Material, archivos, avisos y evaluaciones, por gRPC. |
| `rest/agente.md` | BORRADOR | `POST /agent/chat` con `usuarioId`, `conversacionId` y `mensaje`. |
| `eventos/sesion.*.json` | Estable | Formato Kafka que publica Sesiones; el BFF no lo usa. |

Decisiones de los contratos que afectan al BFF:

- **Autenticación:** `Usuarios.Login` devuelve un JWT HS256 con el id del usuario en `sub` y el vencimiento en `exp` (24 horas). El BFF lo verifica con el mismo secreto (variable `JWT_SECRET`, un Secret de Kubernetes) y saca de ahí el usuario actual. Reemplaza a `x-usuario-id`.
- **Ids:** usuarios y sesiones usan UUID en texto. Los códigos de ramo salen del catálogo `Usuarios.ListarRamos` (ej. `MAT1610`).
- **Nombres en las sesiones:** para mostrar tutor y estudiante de muchas sesiones, usar `Usuarios.ObtenerUsuarios` en lote (una llamada por consulta GraphQL, no una por sesión). Los ids inexistentes se omiten sin error.
- **Material visible:** `ListarMaterial` exige `usuario_id` y devuelve solo lo que ese usuario puede ver; el BFF no filtra por su cuenta.
- **Agente:** el BFF manda el `usuarioId` del token en el cuerpo. La respuesta trae `acciones` (ej. `sesion.creada`) para que el front refresque esas vistas.
- **Direcciones:** `SESIONES_GRPC_URL`, `USUARIOS_GRPC_URL` y `MATERIAL_GRPC_URL` (en Kubernetes `<servicio>:9090`). La URL del agente no está definida en el contrato; usar `AGENTE_URL` y proponerla en el repo de contratos.
- **Build:** el submódulo debe estar presente al compilar y ejecutar. En GitHub Actions el checkout necesita `submodules: true`, y el `Dockerfile` debe copiar `contracts/proto/`.

Pendientes del lado de los contratos:

- Las propuestas de Usuarios y Material están en `propuestas/` del repo de contratos (rama `propuestas/usuarios-material`, PR por abrir). Una vez aprobadas, su `.proto` reemplaza al de `proto/` en otro PR, y el BFF y Sesiones actualizan el submódulo.
- Agregar `tutor_id` y `ramo_codigo` a `VerificarParticipacionResponse` en `sesiones.proto` (campos nuevos, cambio seguro), para que Material guarde la evaluación con una sola llamada. Lo implementa Sesiones.
- El contrato del agente sigue en borrador; Pablo todavía no lo define.
- Cambiar `sesiones.proto` para las decisiones del flujo: `BloqueDisponibilidad` con `ramo_codigo`, `inicio` y `fin` (Timestamp) en vez de `dia`, `hora_ini` y `hora_fin`; RPC para marcar y desmarcar casillas; `ObtenerDisponibilidad` por rango de fechas; `ListarSesiones` con filtros de estado y rango de fechas. Cambiar tipos exige `v2` según el README de contratos, pero el único otro consumidor de esos campos es el agente (borrador): proponer cambiar `v1` con el visto bueno del equipo antes de que alguien lo implemente.
- Coordinar con Pablo (Usuarios): los datos personales que pida el formulario de registro (hoy `Usuario` solo tiene nombre y email) y quién carga el catálogo de ramos.

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

1. Contratos: ✅ repo `Contratos-TutorMatch` creado y usado como submódulo en el BFF y Sesiones; `sesiones.proto` y los eventos Kafka estables. ✅ Decisiones de Usuarios y Material acordadas y redactadas en `propuestas/` (2026-11-15). Pendiente: PR de las propuestas y luego el de los `.proto`; proponer el cambio de `sesiones.proto` para la disponibilidad semanal y los campos nuevos de `VerificarParticipacion`; definir el flujo del alumno, la duración de una casilla y el contrato del agente.
2. Servicio de Sesiones funcional: ✅ Flyway, JPA, servidor gRPC y productor Kafka, probado a mano de punta a punta desde el BFF (2026-11-12): los RPC responden según el contrato y los eventos `sesion.creada`, `sesion.finalizada` y `sesion.cancelada` llegan a Kafka. Pendiente (ver "Decisiones del flujo"):
   1. Cliente gRPC a `Usuarios.ValidarTutorRamo`, con un mock mientras Usuarios no esté, usado al crear una sesión y al marcar disponibilidad (`FAILED_PRECONDITION` si no tiene ese ramo activo).
   2. Migración V3: disponibilidad con fecha concreta, ramo y `EXCLUDE` contra solapes del mismo tutor.
   3. RPC nuevos de disponibilidad y filtros de `ListarSesiones`, una vez acordado el cambio de contrato.
   4. Validaciones al crear: casilla disponible de ese tutor y ramo, no reservarse a sí mismo, sin cruce con otras sesiones del usuario como alumno o tutor.
   5. Desmarcar falla si hay una sesión pendiente o confirmada en ese horario.
   6. Tarea programada: finalizar las confirmadas vencidas y cancelar las pendientes no confirmadas a tiempo, publicando sus eventos.
   7. `VerificarParticipacion` devuelve también `tutor_id` y `ramo_codigo`, una vez aprobado en el contrato.
3. BFF funcional: ✅ resolvers GraphQL y adaptador gRPC hacia Sesiones, probado de punta a punta contra Sesiones real con Postgres y Kafka (2026-11-12). Pendiente, en este orden:
   1. `formatError` para que `extensions.code` sea `NOT_FOUND`, `CONFLICT`, etc.
   2. Módulo `usuarios/` (puerto + mock + gRPC), según `propuestas/usuarios.md`: `registro`, `login`, `yo` (usuario actual, con `esTutor`), `ramos`, `tutoresPorRamo`, `agregarRamosTutor` (formulario de inscripción), `quitarRamoTutor`, `reactivarRamoTutor`, y los campos `tutor` y `estudiante` de `Sesion` resueltos en lote con `ObtenerUsuarios`.
   3. Autenticación con el JWT de Usuarios (`JWT_SECRET`, rechazando tokens vencidos), reemplazando `x-usuario-id`. Sin roles: los permisos por ramo los valida cada servicio.
   4. Sesiones según las decisiones del flujo: filtro por estado y rango de fechas en `sesiones`, una query para la semana del tutor (disponibilidad + reservas en un rango), mutaciones para marcar y desmarcar casillas.
   5. Módulo `material/` (puerto + mock + gRPC), según `propuestas/material.md`:
      - GraphQL: `publicarAviso`, `material`, `eliminarMaterial`, `evaluar`, `evaluacionesTutor`, `misEvaluaciones`, y el promedio y la cantidad de evaluaciones en los tutores del buscador, resueltos en lote con `ObtenerResumenTutores`.
      - REST: `POST /archivos` (multipart, hasta 10 MB, PDF, PNG o JPEG) y `GET /archivos/:id`, con el JWT en la cabecera `Authorization`.
      - Cliente gRPC con límite de mensaje de 11 MB.
   6. Módulo `agente/` (REST a `POST /agent/chat` con `AGENTE_URL`), cuando Pablo defina su contrato.
4. Tests de ambos hasta coverage ≥ 60%.
5. Dockerfile y pipeline de cada repo (checkout con `submodules: true` y `contracts/proto/` copiado en la imagen).