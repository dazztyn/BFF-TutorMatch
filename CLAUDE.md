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
| Frontend | React + Apollo Client | — | Ien |
| BFF / API Gateway | NestJS (GraphQL) | — | **yo** |
| Usuarios | Go | PostgreSQL | Pablo |
| Sesiones | Java + Spring Boot | PostgreSQL | **yo** |
| Material y evaluaciones | NestJS | MongoDB (por confirmar) | Ien |
| MCP server + agente | Go + Gemini | — | Pablo |

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
- Agente → BFF: GraphQL (`BFF_URL`), reenviando el token del usuario. Sus tools no llaman a los servicios por gRPC directo.

### Agente (MCP)

El MCP server expone tools que llaman al BFF por GraphQL con el token del usuario (buscar tutores, ver disponibilidad, crear reserva). Las conversaciones se guardan en memoria, por usuario y conversación. El loop del agente con el LLM en la nube vive en el mismo servicio. Caso de uso principal: "Necesito ayuda con Cálculo II el jueves en la tarde" → busca tutores, propone horarios y crea la reserva.

## Decisiones del flujo (acordadas el 2026-11-12)

Flujo del front definido hasta ahora: inicio de sesión con ingreso y registro de alumnos y de tutores; para el tutor, registro con sus ramos, pantalla principal con su semana y pantalla de archivos por ramo. El flujo del alumno todavía no está definido (buscar tutor, ver su semana, reservar, ver y cancelar sus sesiones, evaluar, ver material).

- **Un usuario puede ser alumno y tutor a la vez** (como en las ayudantías). Es tutor de un ramo cuando se inscribió en él y no lo ha quitado. El detalle está en `propuestas/usuarios.md` del repo de contratos (ver "Decisiones de Usuarios").
  - "Ingreso de alumnos" e "Ingreso de tutores" son el mismo login con dos portales; el front elige la pantalla según `es_tutor`. El registro de tutor es el registro normal más el formulario de inscripción de ramos.
  - El JWT no lleva rol. El permiso se revisa en cada acción: para marcar disponibilidad o crear una sesión en un ramo, Sesiones llama a `Usuarios.ValidarTutorRamo`.
  - Nadie puede reservarse a sí mismo, y un usuario no puede tener dos sesiones que se crucen, aunque en una sea alumno y en la otra tutor.
- **Disponibilidad semana a semana, por ramo:** el tutor marca casillas con fecha concreta para cada ramo que imparte. Una casilla marcada para un ramo deja de estar disponible para los otros (la base lo impide con un `EXCLUDE` sobre `tutor_id` y el rango, como en `sesiones`).
- **Casillas = bloques de clase de la universidad** (acordado el 2026-11-16): 90 minutos, **solo de lunes a viernes** (sin sábados, confirmado el 2026-11-17), con horario fijo en hora de Chile: A 08:10, B 09:55, C 11:40, (almuerzo), D 14:30, E 16:15 y F 18:00. Una sesión ocupa exactamente una casilla. El front dibuja la grilla con estos bloques y los manda en UTC; Sesiones valida con la zona `America/Santiago` que la casilla empieza en un bloque. Detalle y migración V3 en `propuestas/sesiones.md` del repo de contratos; el contrato acordado está en `proto/sesiones/v1/sesiones.proto`.
- **Reservar:** el alumno solo puede tomar una casilla disponible de ese tutor y ese ramo; `CrearSesion` lo valida.
- **Una tutoría por bloque y para un solo alumno** (decidido el 2026-11-23): sin reservas recurrentes ni tutorías grupales. El tutor marca su disponibilidad cada semana; por ahora no hay atajo de "copiar semana".
- **Confirmación:** la reserva queda `PENDIENTE` hasta que el tutor la confirme. Rechazarla es cancelarla. Mientras está pendiente, el horario ya queda bloqueado para otros alumnos.
- **Finalizar:** solo el tutor puede finalizar una sesión a mano, igual que confirmar (además de la tarea programada).
- **Desmarcar:** un horario con una sesión `PENDIENTE` o `CONFIRMADA` no se puede desmarcar (`FAILED_PRECONDITION`); primero se cancela la sesión.
- **Aviso al tutor sin websockets:** la pantalla principal del tutor consulta sus reservas pendientes al cargarse y cada 30 a 60 segundos (`pollInterval` de Apollo Client). El BFF solo necesita que la query `sesiones` filtre por estado. El BFF no consume Kafka ni expone suscripciones.
- **Fin y vencimiento automáticos:** una tarea programada en Sesiones, cada pocos minutos:
  - Una sesión `CONFIRMADA` cuyo `fin` ya pasó pasa a `FINALIZADA` y publica `sesion.finalizada`.
  - Una sesión `PENDIENTE` cuyo `inicio` ya pasó sin confirmación pasa a `CANCELADA` y publica `sesion.cancelada`.
  - Así el alumno siempre puede evaluar: Material solo acepta una evaluación (nota 1 a 5 y comentario) si `VerificarParticipacion` dice que la sesión está `FINALIZADA` y que el alumno participó.
- **Zona horaria:** todo en UTC (base de datos y contratos). La disponibilidad deja de usar "HH:mm". El front calcula la semana en hora de Chile y pide al BFF ese rango convertido a UTC.

### Decisiones de Usuarios (acordadas el 2026-11-15)

Detalle completo, esquema de PostgreSQL en `propuestas/usuarios.md` del repo de contratos; el contrato acordado está en `proto/usuarios/v1/usuarios.proto`. Lo que importa para el BFF:

- **Un solo `Login` y dos portales.** `Login` y `RegistroUsuario` devuelven el token y el usuario, con `es_tutor`. Por el portal de alumnos se entra siempre; por el de tutores, si `es_tutor` es falso, el front invita a inscribirse.
- **`es_tutor` es solo de lectura y solo decide la pantalla.** Usuarios lo guarda y lo recalcula (verdadero si tiene al menos un ramo activo). Los permisos de tutor los validan Sesiones y Material con `ValidarTutorRamo`.
- **Inscribirse como tutor es un formulario de verificación simulado:** por cada ramo, nota de aprobación (4.0 a 7.0) y periodo (ej. `2025-2`). Se aprueba en el acto si los datos son válidos (`AgregarRamosTutor`).
- **Un tutor puede quitar un ramo y reactivarlo** sin repetir el formulario (`QuitarRamoTutor`, `ReactivarRamoTutor`). Quitar un ramo no cancela sus sesiones ya reservadas; solo impide reservas nuevas.
- **RPC acordados:** `RegistroUsuario`, `Login`, `ObtenerUsuario`, `ObtenerUsuarios` (en lote), `AgregarRamosTutor`, `QuitarRamoTutor`, `ReactivarRamoTutor`, `ListarRamos`, `ListarTutoresPorRamo`, `ValidarTutorRamo`. Usan los nombres de Pablo y reemplazan a los del borrador.

### Decisiones de Material (acordadas el 2026-11-15)

Detalle completo, modelo de MongoDB en `propuestas/material.md` del repo de contratos; el contrato acordado está en `proto/material/v1/material.proto`. Lo que importa para el BFF:

- **Quién ve el material:** el tutor ve el suyo; un alumno ve el de un tutor en un ramo si tiene o tuvo una sesión no cancelada con ese tutor en ese ramo. Lo decide Material; el BFF no filtra.
- **Dos tipos de material:** `ARCHIVO` (PDF, PNG o JPEG, hasta 10 MB) y `AVISO` (solo texto). Solo el dueño puede eliminar.
- **Archivos por HTTP en el BFF, por gRPC hacia Material:** `POST /archivos` (multipart) para subir y `GET /archivos/:id` para descargar; el BFF valida el JWT, el tamaño y el tipo, y reenvía los bytes por gRPC. El cliente gRPC de Material en el BFF sube su límite de mensaje a 11 MB (por defecto es 4 MB). Los avisos, listar y eliminar van por GraphQL.
- **Evaluaciones anónimas:** nota de 1 a 5 y comentario opcional, una por sesión, sin editar ni borrar. Material nunca devuelve quién la escribió ni de qué sesión es, salvo al propio alumno (`ListarMisEvaluaciones`).
- **Evaluaciones públicas:** cualquier usuario con sesión iniciada ve el promedio, la cantidad y los comentarios de un tutor. El buscador muestra el promedio con `ObtenerResumenTutores`, en lote.
- **Sin quizzes por ahora:** el agente todavía no está definido.
- **RPC acordados:** `SubirMaterial`, `ListarMaterial`, `DescargarArchivo`, `EliminarMaterial`, `Evaluar`, `ListarEvaluaciones`, `ListarMisEvaluaciones`, `ObtenerResumenTutores`.

## Servicio de Sesiones (Spring Boot)

- Responsable de agenda, disponibilidad de tutores y ciclo de vida de una sesión: `PENDIENTE → CONFIRMADA → FINALIZADA` o `CANCELADA`.
- PostgreSQL con migraciones Flyway. Los choques de horario de un tutor se impiden en la base de datos con un `EXCLUDE USING gist (tutor_id WITH =, horario WITH &&)` sobre un `TSTZRANGE` (requiere `btree_gist`), aplicado solo a sesiones `PENDIENTE` o `CONFIRMADA`.
- Tablas: `sesiones` (id, tutor_id, estudiante_id, ramo_codigo, inicio, fin, horario generado, estado, creada_en) y `disponibilidad`. Desde la migración V3, `disponibilidad` guarda casillas con fecha concreta y ramo (id, tutor_id, ramo_codigo, inicio, fin, horario generado), sin solapes por tutor; ver "Decisiones del flujo".
- Stack: Spring Data JPA, servidor y cliente gRPC, Spring Kafka, tests con JUnit + Testcontainers (Postgres y Kafka reales).

## BFF (NestJS)

- Resolvers GraphQL que traducen a llamadas gRPC, eventos Kafka y REST al MCP.
- Mientras un servicio de un compañero no esté listo, usar mocks del cliente gRPC.
- Es el punto que define los contratos del sistema: cualquier cambio de contrato se coordina con el equipo.

### Estado actual

- Stack: Node 24, NestJS 12 (ESM), TypeScript 6, Apollo Server 5, oxlint, Jest 30.
- GraphQL **code-first**: el esquema se genera desde los modelos y se versiona en `schema.gql` (no editarlo a mano).
- Patrón puerto/adaptador por servicio: `src/sesiones/` tiene el puerto (`SESIONES_PORT` / `SesionesPort`), dos adaptadores (`SesionesGrpc`, real, con `@grpc/grpc-js` + `@grpc/proto-loader`; `SesionesMock`, en memoria), modelos GraphQL y resolver. El adaptador se elige solo en `sesiones.module.ts`: gRPC si existe la variable `SESIONES_GRPC_URL` (ej. `localhost:9090`), si no el mock.
- Usuario actual: decorador `@UsuarioId()` (sirve en GraphQL y en REST) que lee `Authorization: Bearer <token>` y lo verifica en `src/jwt.ts` (`usuarioDeCabecera`) (`jsonwebtoken`, solo HS256, con `JWT_SECRET`); rechaza tokens vencidos, con otra firma o sin `sub` con 401 y devuelve el `sub`. Si falta `JWT_SECRET`, en producción el BFF no arranca; fuera de producción usa un secreto de desarrollo fijo. El mock de Usuarios firma los tokens igual que Pablo (HS256, `sub`, `exp` de 24 horas). Las queries de lectura (`sesiones`, `disponibilidad`, `ramos`, etc.) todavía no exigen token.
- El `.proto` de Sesiones se lee desde el submódulo `contracts/` (`contracts/proto/sesiones/v1/sesiones.proto`, contrato de casillas acordado en `2fa0949`); la carpeta `proto/` del BFF ya no existe.
- Casillas: queries `disponibilidad(tutorId, desde, hasta)` y `buscarDisponibilidad(ramoCodigo, desde, hasta)`, mutaciones `marcarCasilla(ramoCodigo, inicio)` y `desmarcarCasilla(id)`, y filtros `estado`, `desde` y `hasta` en `sesiones`. La semana del tutor se pide con `disponibilidad` y `sesiones` en una sola consulta GraphQL. `BloqueDisponibilidad` tiene el campo `tutor` (nullable, como en `Sesion`), para que el buscador del alumno muestre el nombre y la calificación del tutor en la misma consulta. El mock aplica las mismas reglas que Sesiones (bloques en `America/Santiago`, casilla libre, cruces, solo el tutor confirma y finaliza), salvo `ValidarTutorRamo`, que siempre acepta.
- `src/usuarios/` sigue el mismo patrón: puerto (`USUARIOS_PORT`), `UsuariosGrpc` si existe `USUARIOS_GRPC_URL` (el servidor de Pablo escucha por defecto en el puerto 50051) y si no `UsuariosMock`. El mock aplica las reglas del contrato (email único sin importar mayúsculas, contraseñas con hash scrypt, `esTutor` calculado desde los ramos activos, inscripción todo o nada, quitar y reactivar) con un catálogo de ramos de ejemplo. Los campos `tutor` y `estudiante` de `Sesion` se piden en lote con `ObtenerUsuarios`.
- Carga en lote: `src/cargador.ts` (`crearCargador`) junta en una sola llamada los ids que piden los resolvers de una consulta, con un cargador por request guardado en el contexto GraphQL. Lo usan `tutor` y `estudiante` de `Sesion` y `tutor` de `BloqueDisponibilidad` (`ObtenerUsuarios`, con el mismo cargador: una consulta con sesiones y casillas hace una sola llamada) y el promedio de evaluaciones en `Usuario` (`ObtenerResumenTutores`).
- Cliente gRPC común en `src/grpc.ts` (`ClienteGrpc` y `aExcepcion`): carga `contracts/proto/<servicio>/v1/<servicio>.proto` y traduce los códigos de estado, incluido `UNAUTHENTICATED` → 401. Acepta opciones del canal (Material sube el límite de mensaje a 11 MB). También tiene `aDate` y `aTimestamp` para `google.protobuf.Timestamp`. Lo usan los adaptadores de Sesiones, Usuarios y Material.
- `src/material/` sigue el mismo patrón: puerto (`MATERIAL_PORT`), `MaterialGrpc` si existe `MATERIAL_GRPC_URL` y si no `MaterialMock`. Por ahora cubre los avisos: `publicarAviso(ramoCodigo, titulo, texto)`, la query `material(tutorId, ramoCodigo)` (solo lo visible para el usuario del token) y `eliminarMaterial(id)`. El mock recibe `SESIONES_PORT` y `USUARIOS_PORT` (exportados por sus módulos) y aplica las reglas del contrato: para publicar, el tutor necesita el ramo activo; un alumno ve el material de un tutor en un ramo si tiene o tuvo una sesión no cancelada con él en ese ramo; lo que no puede ver responde `NOT_FOUND`; solo el dueño elimina (`FORBIDDEN`).
- Evaluaciones (en `src/material/evaluaciones.resolver.ts`): `evaluar(sesionId, nota, comentario)` con el alumno del token, `evaluacionesTutor(tutorId)` (promedio, cantidad y evaluaciones anónimas: el tipo `EvaluacionAnonima` no tiene `sesionId` ni alumno) y `misEvaluaciones` (con `sesionId`). `Usuario` tiene `promedioEvaluaciones` y `cantidadEvaluaciones` (0 y 0 si no tiene). El mock valida con `SESIONES_PORT` que la sesión exista (`NOT_FOUND`), esté `FINALIZADA` y el alumno haya participado (`CONFLICT`), que no esté evaluada (`CONFLICT`), y la nota (entero de 1 a 5) y el comentario (hasta 1000 caracteres) (`BAD_REQUEST`).
- Archivos por REST (`src/material/archivos.controller.ts`): `POST /archivos` (multipart con `archivo`, `ramoCodigo` y `titulo`) y `GET /archivos/:id`. `TokenGuard` (`src/token.guard.ts`) exige el token antes de que multer reciba el archivo. La subida limita a 10 MB (413), acepta solo PDF, PNG o JPEG y revisa además los primeros bytes (`%PDF-`, firma PNG, `FF D8 FF`), porque el tipo MIME lo manda el cliente; si no calzan, 400. Los nombres con tildes se leen en UTF-8 (`defParamCharset`). La descarga responde con su `Content-Type`, `Content-Disposition: inline` con el nombre en RFC 5987 y `X-Content-Type-Options: nosniff`.
- `src/agente/` sigue el mismo patrón, pero por REST: puerto (`AGENTE_PORT`), `AgenteHttp` si existe `AGENTE_URL` (fetch nativo de Node, sin dependencias, con plazo `AGENTE_TIMEOUT_MS`, 120000 por defecto) y si no `AgenteMock`, que responde un texto fijo sin acciones. La mutación `chatAgente(mensaje, conversacionId)` exige token, toma el `usuarioId` del token, valida el mensaje (1 a 2000 caracteres) y el `conversacionId` (hasta 128) antes de llamar al agente, y le reenvía la misma cabecera `Authorization`, porque el agente llama al BFF con ese token. Los errores del agente se traducen así: 400 → `BAD_REQUEST`, 429 → `TOO_MANY_REQUESTS`, 504 → `GATEWAY_TIMEOUT`, y 503, caído o fuera de plazo → `SERVICE_UNAVAILABLE`.

### Aviso para el frontend (leer antes de manejar errores)

Cuando un compañero empiece el frontend, recordarle esto:

- Para distinguir errores, usar **`extensions.code`**: `BAD_REQUEST` (datos inválidos, horario que no es un bloque, reservarse a sí mismo), `UNAUTHENTICATED` (sin usuario), `FORBIDDEN` (no participa, casilla ajena, solo el tutor confirma y solo el tutor finaliza), `NOT_FOUND`, `CONFLICT` (casilla ocupada o solapada, cruce de horario, transición de estado inválida, desmarcar con sesión activa), `TOO_MANY_REQUESTS` (demasiados mensajes al agente; reintentar en unos segundos), `SERVICE_UNAVAILABLE` (servicio caído, o el agente o Gemini no responden a tiempo) y `GATEWAY_TIMEOUT` (el agente superó su máximo de pasos). Lo traduce `formatError` en `app.module.ts`.
- El `stacktrace` que aparece en las respuestas es solo de desarrollo; en Kubernetes se oculta con `NODE_ENV=production`.
- Las mutations de sesiones (`crearSesion`, `marcarCasilla`, `desmarcarCasilla`, `confirmarSesion`, `cancelarSesion`, `finalizarSesion`) las de usuarios (`agregarRamosTutor`, `quitarRamoTutor`, `reactivarRamoTutor`) las de material (`publicarAviso`, `eliminarMaterial`, `evaluar`) y `chatAgente`, además de las queries `yo`, `material`, `evaluacionesTutor` y `misEvaluaciones`, requieren la cabecera `Authorization: Bearer <token>`, con el token que devuelven `registro` y `login`. Sin ella, o con un token vencido o inválido, responden `UNAUTHENTICATED`. El token dura 24 horas; al vencer, hay que volver a iniciar sesión.
- `chatAgente(mensaje, conversacionId)` devuelve `{ conversacionId respuesta acciones { tipo id } }`. Para seguir la conversación se manda el `conversacionId` de la respuesta anterior. Si `acciones` trae `sesion.creada`, el agente reservó y hay que refrescar esa vista. **Puede tardar hasta unos 2 minutos**: mostrar que está pensando y no reintentar mientras tanto.
- Archivos (REST, no GraphQL), con la misma cabecera `Authorization`:
  - `POST /archivos`: multipart con los campos `archivo`, `ramoCodigo` y `titulo`. Responde 201 con el `Material` creado (JSON). Errores: 400 (falta un campo, o el archivo no es PDF, PNG ni JPEG de verdad), 401 (sin token o inválido), 403 (no tiene ese ramo activo), 413 (más de 10 MB), 503 (Material caído).
  - `GET /archivos/:id`: los bytes. Exige la cabecera `Authorization`, así que un `<img src>` o un `<a href>` directo da 401 (no mandan cabeceras): el front lo baja con `fetch` y la cabecera, y lo muestra con `URL.createObjectURL(blob)` (o lo descarga con un `<a download>` sobre ese object URL). Errores: 400 (es un aviso), 401, 404 (no existe o no puede verlo), 503.
  - Los errores REST vienen con el formato de Nest: `{ statusCode, message, error }`. El mensaje del 413 sale en inglés ("File too large").
- Zona horaria: no sumar horas fijas a UTC, porque las fechas del cambio de horario de Chile varían. Convertir con la zona `America/Santiago` usando una librería, como `date-fns-tz` (`fromZonedTime`, `formatInTimeZone`) o `Temporal`.
- **CORS (decidido el 2026-11-24): el BFF no lo habilita, a propósito.**
  - En desarrollo, el front usa el proxy de Vite (`/graphql` y `/archivos` hacia `http://localhost:3000`), así que el navegador ve el mismo origen.
  - En Kubernetes, el ingress publica el front y el BFF bajo el mismo dominio (por ejemplo, `/` para el front y `/graphql` y `/archivos` para el BFF).
  - Si algún día el front se publica en otro dominio, habría que agregar `enableCors` con una lista de orígenes leída de una variable de entorno.

## Contratos

Viven en el repo `Contratos-TutorMatch` (GitHub `dazztyn/Contratos-TutorMatch`), incluido como submódulo en `contracts/` en el BFF y en Sesiones. Su `README.md` tiene las convenciones y las reglas para cambiar un contrato; leerlo antes de tocar uno. Un cambio de contrato se hace por PR en ese repo, no en las copias de cada servicio.

| Archivo | Estado | Qué significa para el BFF |
|---|---|---|
| `proto/sesiones/v1/sesiones.proto` | Acordado en `main` (`2fa0949`), implementado | Contrato de casillas por bloques; ya lo usa `SesionesGrpc`. |
| `proto/usuarios/v1/usuarios.proto` | Acordado en `main` (`2fa0949`) | Registro, login (JWT), datos de usuario, ramos y búsqueda de tutores (`RegistroUsuario`, `Login`, ..., `ValidarTutorRamo`). |
| `proto/material/v1/material.proto` | Acordado en `main` (`2fa0949`) | Material, archivos, avisos y evaluaciones, por gRPC (`SubirMaterial`, ..., `ObtenerResumenTutores`). |
| `rest/agente.md` | Acordado en `main` (`fb9118c`), implementado | `POST /agent/chat`; ver "Decisiones de los contratos". |
| `eventos/sesion.*.json` | Estable | Formato Kafka que publica Sesiones; el BFF no lo usa. |

Decisiones de los contratos que afectan al BFF:

- **Autenticación:** `Usuarios.Login` devuelve un JWT HS256 con el id del usuario en `sub` y el vencimiento en `exp` (24 horas). El BFF lo verifica con el mismo secreto (variable `JWT_SECRET`, un Secret de Kubernetes) y saca de ahí el usuario actual. Ya está implementado (reemplazó a `x-usuario-id`).
- **Ids:** usuarios y sesiones usan UUID en texto. Los códigos de ramo salen del catálogo `Usuarios.ListarRamos` (ej. `MAT1610`).
- **Nombres en las sesiones:** para mostrar tutor y estudiante de muchas sesiones, usar `Usuarios.ObtenerUsuarios` en lote (una llamada por consulta GraphQL, no una por sesión). Los ids inexistentes se omiten sin error.
- **Material visible:** `ListarMaterial` exige `usuario_id` y devuelve solo lo que ese usuario puede ver; el BFF no filtra por su cuenta.
- **Agente:** `rest/agente.md` (`fb9118c`, de Pablo), implementado en `pablofgx-code/tutormatch-agente` (`main` en `95abeb5`). Su sección "Restricciones de operación en Kubernetes" pide 1 réplica (las conversaciones viven en memoria) y el Service `agente:8081` solo interno (`/mcp` confía en `X-Usuario-Id`). `POST {AGENTE_URL}/agent/chat` con `Content-Type: application/json` y el mismo `Authorization: Bearer <token>` del usuario; cuerpo `{ usuarioId, conversacionId?, mensaje }`; respuesta 200 `{ conversacionId, respuesta, acciones: [{ tipo, id }] }`. Errores con cuerpo `{ "error": "mensaje" }`: 400 (datos inválidos), 429 (límite por usuario), 503 (Gemini no responde) y 504 (superó el máximo de pasos). Gemini tiene 90 s de espera por llamada.
- **Direcciones:** `SESIONES_GRPC_URL`, `USUARIOS_GRPC_URL` y `MATERIAL_GRPC_URL` (en Kubernetes `<servicio>:9090`) y `AGENTE_URL` (`http://localhost:8081` en local, `http://agente:8081` en Kubernetes).
- **Build:** el submódulo debe estar presente al compilar y ejecutar. En GitHub Actions el checkout necesita `submodules: true`, y el `Dockerfile` debe copiar `contracts/proto/`.

Pendientes del lado de los contratos:

- Coordinar con Pablo (Usuarios), para Kubernetes:
  - El mismo Secret `JWT_SECRET` para Usuarios y el BFF; el valor por defecto de su servicio es solo de desarrollo.
  - El puerto: su servidor escucha en el 50051 y lo acordado es `usuarios:9090`; se resuelve con `PORT=9090` en su manifiesto.
- Coordinar con Pablo (Usuarios): los datos personales que pida el formulario de registro (hoy `Usuario` solo tiene nombre y email) y quién carga el catálogo de ramos.

### Prueba de integración con Usuarios (2026-11-21)

A mano, con GraphiQL, contra los servicios reales:

- **BFF** con `SESIONES_GRPC_URL=localhost:9090`, `USUARIOS_GRPC_URL=localhost:50051` y `JWT_SECRET=dev-secret-cambiar-en-produccion`.
- **Usuarios** de Pablo (`pablofgx-code/tutormatch-usuarios`, `main` en `ac11d53`, contratos en `2fa0949`), en Docker desde su `Dockerfile` (no hay Go en el equipo), con su Postgres en el 55433 y el gRPC en el 50051.
- **Sesiones** con `USUARIOS_GRPC_URL` hacia el servidor de Pablo y su Postgres en el 55432.

Funcionó todo el flujo:

- El catálogo de ramos real (en el de Pablo, `MAT1610` es "Cálculo I").
- Registro y login: los tokens firmados por Pablo pasan la verificación del BFF si `JWT_SECRET` coincide.
- Inscribir, quitar y reactivar ramos.
- Marcar casillas, incluido el rechazo de un ramo que la tutora no tiene (`CONFLICT`).
- Reservar, con los nombres traídos por `ObtenerUsuarios`.
- Confirmar.

### Prueba de integración con Material (2026-11-24)

A mano, con GraphiQL y curl, con todos los servicios reales salvo el agente:

- **BFF** con `SESIONES_GRPC_URL=localhost:9090`, `USUARIOS_GRPC_URL=localhost:50051`, `MATERIAL_GRPC_URL=localhost:9095` y `JWT_SECRET=dev-secret-cambiar-en-produccion`.
- **Material** de Ien (`IenZAVALA-S/tutormatch-material`, `main` en `a61d82d`, contratos en `2fa0949`), clonado en `Desktop	utormatch-material` y corrido con `node dist/main.js`:
  - `GRPC_URL=0.0.0.0:9095` (el 9090 lo usa Sesiones);
  - el Mongo de su `docker-compose`, en el 27018;
  - `KAFKA_BROKERS=localhost:9092`: el Kafka de Sesiones, no el de su compose;
  - Usuarios y Sesiones reales.
- **Usuarios** de Pablo en Docker (50051) y **Sesiones** real (9090), igual que en la prueba del 2026-11-21.

Funcionó todo:

- `publicarAviso`: Material validó el ramo con `Usuarios.ValidarTutorRamo`.
- `material(tutorId)`:
  - el alumno con una sesión con la tutora ve el aviso, porque Material armó su copia de las sesiones desde los eventos Kafka de Sesiones;
  - un usuario sin sesiones recibe una lista vacía.
- `POST /archivos` con un PDF de 2,1 MB y `GET /archivos/:id` como alumno: el archivo descargado es idéntico.
- La tarea programada de Sesiones pasó la sesión del 2026-11-23 a `FINALIZADA`.
- `evaluar`: lo aceptó, porque Material validó con `Sesiones.VerificarParticipacion`; repetir la evaluación dio `CONFLICT` ("Esta sesión ya fue evaluada").
- `evaluacionesTutor`: promedio 5, cantidad 1.
- Con esto queda probado el ida y vuelta con dos protocolos que pide el curso: Sesiones → Material por Kafka y Material → Sesiones por gRPC.

Observaciones para Ien:

- Su repo todavía no tiene `.github/workflows` (CI).
- Su `docker-compose` levanta un Kafka propio en el 9092, que choca con el de Sesiones.
- kafkajs muestra un `TimeoutNegativeWarning` al arrancar, sin efecto.
- Material rechaza ids que no son UUID (`INVALID_ARGUMENT`). Las sesiones viejas de pruebas manuales, con ids como `tut-e2e-278`, podrían provocar ese error en las consultas de promedios.

### Prueba de integración con el agente (2026-11-26)

A mano, con GraphiQL:

- **Agente** de Pablo (`pablofgx-code/tutormatch-agente`, `main` en `95abeb5`), clonado en `Desktop\tutormatch-agente` y levantado con su `docker compose up -d --build`:
  - la `GEMINI_API_KEY` en el `.env` de esa carpeta (lo excluyen su `.gitignore` y su `.dockerignore`);
  - `BFF_URL=http://host.docker.internal:3000/graphql`, para que el contenedor llegue al BFF del equipo;
  - el modelo por defecto, `gemini-flash-lite-latest`.
- **BFF** con `SESIONES_GRPC_URL=localhost:9090`, `USUARIOS_GRPC_URL=localhost:50051`, `JWT_SECRET=dev-secret-cambiar-en-produccion` y `AGENTE_URL=http://localhost:8081`. Sin `MATERIAL_GRPC_URL`: Material quedó con el mock, así que el promedio de los tutores sale en 0.
- **Usuarios** de Pablo en Docker (50051) y **Sesiones** real (9090), igual que en las pruebas del 2026-11-21 y del 2026-11-24.
- Antes de la prueba se validaron contra `schema.gql` las 5 operaciones GraphQL del agente (`ramos`, `tutoresPorRamo`, `buscarDisponibilidad`, `disponibilidad`, `crearSesion`), sin errores.

Funcionó todo:

- Con cuentas nuevas, la tutora se inscribió en `MAT1610` y marcó los bloques D y E del jueves 2026-12-03 (`17:30Z` y `19:15Z`).
- El alumno escribió "Necesito ayuda con Cálculo I el jueves en la tarde". El agente notó que el jueves 26 ya no tenía bloques en la tarde y propuso los del 3 de diciembre, en hora de Chile (14:30 y 16:15) y con el nombre de la tutora, con `acciones` vacío.
- Al confirmar el horario con el mismo `conversacionId`, el agente reservó y respondió `acciones` con `sesion.creada`:
  - la sesión quedó `PENDIENTE` en Sesiones, con "Tutora Agente" y "Alumno Agente";
  - el alumno salió del token que el agente reenvió, no del modelo.
- La tutora confirmó la sesión con `confirmarSesion`.
- Cadena probada: alumno → BFF (GraphQL) → agente (REST) → Gemini → tools → BFF (GraphQL, con el mismo token) → Sesiones (gRPC) → Usuarios (`ValidarTutorRamo`).

Observación: `sesiones(estado: PENDIENTE)` sin `tutorId` ni `estudianteId`, y sin token, devolvió también las sesiones de otros usuarios (de una prueba anterior). Ver "Próximos pasos".

Si Docker Desktop se reinicia, los contenedores de prueba quedan apagados. Para levantarlos en orden (PowerShell):

```powershell
docker start usuarios-pg-prueba sesiones-pg material-mongo sesionesarq2-kafka-1; Start-Sleep 6; docker start usuarios-grpc-prueba
```

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

1. Contratos: ✅ repo `Contratos-TutorMatch` creado y usado como submódulo en el BFF y Sesiones; `sesiones.proto` y los eventos Kafka estables. ✅ Decisiones de Usuarios y Material acordadas y redactadas en `propuestas/` (2026-11-15). ✅ Bloques horarios acordados en `propuestas/sesiones.md` (2026-11-16). ✅ Contratos de Sesiones, Usuarios y Material acordados en `proto/` (`2fa0949`), con tutorías solo de lunes a viernes (2026-11-17). ✅ Contrato del agente acordado en `rest/agente.md` (`fb9118c`, 2026-11-24).
2. Servicio de Sesiones funcional: ✅ Flyway, JPA, servidor gRPC y productor Kafka, probado a mano de punta a punta desde el BFF (2026-11-12). ✅ Casillas por bloques según el contrato acordado (PR 5): migración V3, `MarcarCasilla`, `DesmarcarCasilla`, `ObtenerDisponibilidad` por rango, `BuscarDisponibilidad`, filtros de `ListarSesiones`, validaciones al crear y desmarcar, tarea programada de fin y vencimiento, `VerificarParticipacion` con `tutor_id` y `ramo_codigo`, y solo el tutor confirma y finaliza. Probado de punta a punta desde el BFF (2026-11-16). ✅ Adaptador gRPC real de `Usuarios.ValidarTutorRamo`, probado contra el servidor de Pablo (2026-11-21). ✅ Tests con JaCoCo ≥ 60%, Dockerfile y CI (PR mergeados). Pendiente: Kubernetes.
3. BFF funcional: ✅ resolvers GraphQL y adaptador gRPC hacia Sesiones, probado de punta a punta contra Sesiones real con Postgres y Kafka (2026-11-12). Todos los módulos están hechos y probados contra los servicios reales. Pendiente antes de la demo: que cada usuario vea solo lo suyo (punto 7).
   1. ✅ `formatError` para que `extensions.code` sea `NOT_FOUND`, `CONFLICT`, etc.
   2. ✅ Módulo `usuarios/` (puerto + mock + gRPC), según el contrato acordado: `registro`, `login`, `yo` (usuario actual, con `esTutor`), `ramos`, `tutoresPorRamo`, `agregarRamosTutor` (formulario de inscripción), `quitarRamoTutor`, `reactivarRamoTutor`, y los campos `tutor` y `estudiante` de `Sesion` resueltos en lote con `ObtenerUsuarios`. Probado contra el mock (2026-11-17) y contra el servidor real de Pablo (2026-11-21, ver "Prueba de integración con Usuarios").
   3. ✅ Autenticación con el JWT de Usuarios (`JWT_SECRET`, rechazando tokens vencidos), reemplazando `x-usuario-id`. Sin roles: los permisos por ramo los valida cada servicio. Probado contra el mock (2026-11-17) y con tokens emitidos por el servidor real de Pablo (2026-11-21).
   4. ✅ Sesiones según `propuestas/sesiones.md` (casillas, búsqueda, filtros, mock con las mismas reglas; `crearSesion` solo pide `inicio` y el BFF calcula el fin), probado de punta a punta contra Sesiones real (2026-11-16, 25 casos).
   5. Módulo `material/` (puerto + mock + gRPC), según `propuestas/material.md`:
      - ✅ Avisos por GraphQL: `publicarAviso`, `material`, `eliminarMaterial`, y cliente gRPC con límite de mensaje de 11 MB. Probado contra el mock (2026-11-20).
      - ✅ GraphQL de evaluaciones: `evaluar`, `evaluacionesTutor`, `misEvaluaciones`, y `promedioEvaluaciones` y `cantidadEvaluaciones` en `Usuario`, resueltos en lote con `ObtenerResumenTutores`. Probado contra el mock (2026-11-21). Ojo: `tutoresPorRamo` no exige token, así que el promedio se puede ver sin sesión iniciada.
      - ✅ REST: `POST /archivos` (multipart, hasta 10 MB, PDF, PNG o JPEG, validando los primeros bytes) y `GET /archivos/:id`, con el JWT en la cabecera `Authorization`. Probado contra el mock (2026-11-21).
      - ✅ Probado todo el módulo contra el servicio real de Ien (2026-11-24, ver "Prueba de integración con Material").
   6. ✅ Módulo `agente/` (REST a `POST /agent/chat` con `AGENTE_URL`), según `rest/agente.md`. Probado contra el mock y contra un agente falso con los códigos 200, 429, 504 y fuera de plazo (2026-11-24), y contra el agente real de Pablo con Gemini, de la búsqueda a la reserva (2026-11-26, ver "Prueba de integración con el agente").
   7. Pendiente antes de la demo: que cada usuario vea solo lo suyo. Hoy las queries de lectura no exigen token, y `sesiones` sin `tutorId` ni `estudianteId` devuelve las sesiones de todos (visto en la prueba del 2026-11-26).
4. Tests hasta coverage ≥ 60%: ✅ Sesiones (JaCoCo). ✅ BFF (2026-11-23): 71 tests unitarios con umbral de 60% en líneas, sentencias, ramas y funciones en `jest.config.ts` (solo se excluye `src/main.ts`); quedó en 87% de líneas, 88% de sentencias, 83% de ramas y 70% de funciones. Los adaptadores gRPC se prueban contra un servidor gRPC falso con los `.proto` reales (`test/servidor-grpc-falso.ts`).
5. Dockerfile y pipeline: ✅ Sesiones. ✅ BFF (2026-11-23): `Dockerfile` multietapa (`node:24-alpine`, solo dependencias de producción, `dist/` y `contracts/proto/`, usuario `node`, `NODE_ENV=production`; en producción el esquema GraphQL se arma en memoria y no se escribe `schema.gql`) y `.github/workflows/ci.yml` (checkout con submódulo, lint, `test:cov` con umbral, `test:e2e` y `docker build`, sin publicar la imagen). Falta ver el primer run en GitHub.
6. Kubernetes: manifiestos y despliegue de cada servicio (pendiente en todos).