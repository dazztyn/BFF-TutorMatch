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
- **Disponibilidad semana a semana, por ramo:** el tutor marca casillas con fecha concreta para cada ramo que imparte. Una casilla marcada para un ramo deja de estar disponible para los otros (la base lo impide con un `EXCLUDE` sobre `tutor_id` y el rango, como en `sesiones`).
- **Casillas = bloques de clase de la universidad** (acordado el 2026-11-16): 90 minutos, **solo de lunes a viernes** (sin sábados, confirmado el 2026-11-17), con horario fijo en hora de Chile: A 08:10, B 09:55, C 11:40, (almuerzo), D 14:30, E 16:15 y F 18:00. Una sesión ocupa exactamente una casilla. El front dibuja la grilla con estos bloques y los manda en UTC; Sesiones valida con la zona `America/Santiago` que la casilla empieza en un bloque. Detalle y migración V3 en `propuestas/sesiones.md` del repo de contratos; el contrato acordado está en `proto/sesiones/v1/sesiones.proto`.
- **Reservar:** el alumno solo puede tomar una casilla disponible de ese tutor y ese ramo; `CrearSesion` lo valida.
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
- Usuario actual: decorador `@UsuarioId()` que lee la cabecera `x-usuario-id` (temporal, sin autenticación). Se reemplaza por el JWT de Usuarios (ver Contratos).
- El `.proto` de Sesiones se lee desde el submódulo `contracts/` (`contracts/proto/sesiones/v1/sesiones.proto`, contrato de casillas acordado en `2fa0949`); la carpeta `proto/` del BFF ya no existe.
- Casillas: queries `disponibilidad(tutorId, desde, hasta)` y `buscarDisponibilidad(ramoCodigo, desde, hasta)`, mutaciones `marcarCasilla(ramoCodigo, inicio)` y `desmarcarCasilla(id)`, y filtros `estado`, `desde` y `hasta` en `sesiones`. La semana del tutor se pide con `disponibilidad` y `sesiones` en una sola consulta GraphQL. El mock aplica las mismas reglas que Sesiones (bloques en `America/Santiago`, casilla libre, cruces, solo el tutor confirma), salvo `ValidarTutorRamo`, que siempre acepta. Pendiente en el mock: todavía deja finalizar al alumno; debe aceptar solo al tutor, como Sesiones.
- Aún no hay módulos de Usuarios (gRPC), Material (gRPC) ni Agente (REST).

### Aviso para el frontend (leer antes de manejar errores)

Cuando un compañero empiece el frontend, recordarle esto:

- Para distinguir errores, usar **`extensions.code`**: `BAD_REQUEST` (datos inválidos, horario que no es un bloque, reservarse a sí mismo), `UNAUTHENTICATED` (sin usuario), `FORBIDDEN` (no participa, casilla ajena, solo el tutor confirma y solo el tutor finaliza), `NOT_FOUND`, `CONFLICT` (casilla ocupada o solapada, cruce de horario, transición de estado inválida, desmarcar con sesión activa) y `SERVICE_UNAVAILABLE` (servicio caído). Lo traduce `formatError` en `app.module.ts`.
- El `stacktrace` que aparece en las respuestas es solo de desarrollo; en Kubernetes se oculta con `NODE_ENV=production`.
- Las mutations de sesiones (`crearSesion`, `confirmarSesion`, `cancelarSesion`, `finalizarSesion`) requieren la cabecera `x-usuario-id` (temporal, hasta que exista el login); sin ella responden 401. Cuando entre el login, esa cabecera se reemplaza por `Authorization: Bearer <token>`.

## Contratos

Viven en el repo `Contratos-TutorMatch` (GitHub `dazztyn/Contratos-TutorMatch`), incluido como submódulo en `contracts/` en el BFF y en Sesiones. Su `README.md` tiene las convenciones y las reglas para cambiar un contrato; leerlo antes de tocar uno. Un cambio de contrato se hace por PR en ese repo, no en las copias de cada servicio.

| Archivo | Estado | Qué significa para el BFF |
|---|---|---|
| `proto/sesiones/v1/sesiones.proto` | Acordado en `main` (`2fa0949`), implementado | Contrato de casillas por bloques; ya lo usa `SesionesGrpc`. |
| `proto/usuarios/v1/usuarios.proto` | Acordado en `main` (`2fa0949`) | Registro, login (JWT), datos de usuario, ramos y búsqueda de tutores (`RegistroUsuario`, `Login`, ..., `ValidarTutorRamo`). |
| `proto/material/v1/material.proto` | Acordado en `main` (`2fa0949`) | Material, archivos, avisos y evaluaciones, por gRPC (`SubirMaterial`, ..., `ObtenerResumenTutores`). |
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

- El contrato del agente sigue en borrador; Pablo todavía no lo define.
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

1. Contratos: ✅ repo `Contratos-TutorMatch` creado y usado como submódulo en el BFF y Sesiones; `sesiones.proto` y los eventos Kafka estables. ✅ Decisiones de Usuarios y Material acordadas y redactadas en `propuestas/` (2026-11-15). ✅ Bloques horarios acordados en `propuestas/sesiones.md` (2026-11-16). ✅ Contratos de Sesiones, Usuarios y Material acordados en `proto/` (`2fa0949`), con tutorías solo de lunes a viernes (2026-11-17). Pendiente: definir el contrato del agente.
2. Servicio de Sesiones funcional: ✅ Flyway, JPA, servidor gRPC y productor Kafka, probado a mano de punta a punta desde el BFF (2026-11-12). ✅ Casillas por bloques según el contrato acordado (PR 5): migración V3, `MarcarCasilla`, `DesmarcarCasilla`, `ObtenerDisponibilidad` por rango, `BuscarDisponibilidad`, filtros de `ListarSesiones`, validaciones al crear y desmarcar, tarea programada de fin y vencimiento, `VerificarParticipacion` con `tutor_id` y `ramo_codigo`, y solo el tutor confirma y finaliza. Probado de punta a punta desde el BFF (2026-11-16). Pendiente:
   1. Adaptador gRPC real de `Usuarios.ValidarTutorRamo` (hoy usa un mock que siempre acepta), ya desbloqueado porque `usuarios.proto` está en `contracts/proto`.
   2. Luego tests, Docker y CI.
3. BFF funcional: ✅ resolvers GraphQL y adaptador gRPC hacia Sesiones, probado de punta a punta contra Sesiones real con Postgres y Kafka (2026-11-12). Pendiente, en este orden (lo siguiente es el módulo `usuarios/` con JWT, pasos 2 y 3, ya desbloqueado porque `usuarios.proto` está en `contracts/proto`):
   1. ✅ `formatError` para que `extensions.code` sea `NOT_FOUND`, `CONFLICT`, etc.
   2. Módulo `usuarios/` (puerto + mock + gRPC), según `propuestas/usuarios.md`: `registro`, `login`, `yo` (usuario actual, con `esTutor`), `ramos`, `tutoresPorRamo`, `agregarRamosTutor` (formulario de inscripción), `quitarRamoTutor`, `reactivarRamoTutor`, y los campos `tutor` y `estudiante` de `Sesion` resueltos en lote con `ObtenerUsuarios`.
   3. Autenticación con el JWT de Usuarios (`JWT_SECRET`, rechazando tokens vencidos), reemplazando `x-usuario-id`. Sin roles: los permisos por ramo los valida cada servicio.
   4. ✅ Sesiones según `propuestas/sesiones.md` (casillas, búsqueda, filtros, mock con las mismas reglas; `crearSesion` solo pide `inicio` y el BFF calcula el fin), probado de punta a punta contra Sesiones real (2026-11-16, 25 casos). Pendiente: que el mock acepte finalizar solo al tutor.
   5. Módulo `material/` (puerto + mock + gRPC), según `propuestas/material.md`:
      - GraphQL: `publicarAviso`, `material`, `eliminarMaterial`, `evaluar`, `evaluacionesTutor`, `misEvaluaciones`, y el promedio y la cantidad de evaluaciones en los tutores del buscador, resueltos en lote con `ObtenerResumenTutores`.
      - REST: `POST /archivos` (multipart, hasta 10 MB, PDF, PNG o JPEG) y `GET /archivos/:id`, con el JWT en la cabecera `Authorization`.
      - Cliente gRPC con límite de mensaje de 11 MB.
   6. Módulo `agente/` (REST a `POST /agent/chat` con `AGENTE_URL`), cuando Pablo defina su contrato.
4. Tests de ambos hasta coverage ≥ 60%.
5. Dockerfile y pipeline de cada repo (checkout con `submodules: true` y `contracts/proto/` copiado en la imagen).