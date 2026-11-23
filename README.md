# BFF-TutorMatch

Backend for Frontend de **TutorMatch**, la plataforma donde los estudiantes reservan tutorías con otros estudiantes que aprobaron el ramo. Es la única puerta de entrada del front: recibe GraphQL (y REST para los archivos), verifica el token y reparte cada operación al microservicio que corresponde.

```
Front ──GraphQL──▶ BFF (NestJS) ──gRPC──▶ Sesiones  (Spring Boot)
      ──REST────▶  /archivos    ──gRPC──▶ Usuarios  (Go)
                                ──gRPC──▶ Material  (NestJS)
                                ──REST──▶ Agente    (pendiente)
```

## Cómo está hecho

Cada servicio tiene su módulo en `src/` con el mismo patrón **puerto/adaptador**:

| Módulo | Qué hace | Variable que elige el adaptador real |
|---|---|---|
| `src/sesiones/` | Casillas de disponibilidad, reservas y su ciclo de vida | `SESIONES_GRPC_URL` |
| `src/usuarios/` | Registro, login, ramos e inscripción como tutor | `USUARIOS_GRPC_URL` |
| `src/material/` | Avisos, archivos y evaluaciones | `MATERIAL_GRPC_URL` |

- Si la variable existe, el BFF llama al servicio real por gRPC.
- Si no, usa un **mock en memoria** que aplica las mismas reglas que el servicio. Sirve para trabajar en el front sin levantar nada más, pero **los datos se borran cada vez que el BFF se reinicia**.
- Los `.proto` vienen del submódulo `contracts/` (repo `Contratos-TutorMatch`).
- El esquema GraphQL se genera desde el código y queda en [`schema.gql`](schema.gql): ahí están todas las queries, mutaciones y tipos.

## Requisitos

- **Node 24.9 o superior** (hay un `.nvmrc`).
- **El submódulo `contracts/`**. Sin él, el BFF no encuentra los `.proto` y los adaptadores gRPC no arrancan.

```bash
git clone --recurse-submodules https://github.com/dazztyn/BFF-TutorMatch.git
```

Si ya lo clonaste sin el submódulo:

```bash
git submodule update --init
```

Luego instala las dependencias:

```bash
npm install
```

## Variables de entorno

| Variable | Para qué | Si no está |
|---|---|---|
| `SESIONES_GRPC_URL` | Dirección de Sesiones, ej. `localhost:9090` | Mock de Sesiones |
| `USUARIOS_GRPC_URL` | Dirección de Usuarios, ej. `localhost:50051` | Mock de Usuarios |
| `MATERIAL_GRPC_URL` | Dirección de Material, ej. `localhost:9091` | Mock de Material |
| `JWT_SECRET` | Secreto con que Usuarios firma los tokens; el BFF verifica con el mismo | En desarrollo, un secreto fijo. **En producción el BFF no arranca** |
| `NODE_ENV` | `production` en Kubernetes: exige `JWT_SECRET` y oculta el `stacktrace` de los errores | Modo desarrollo |
| `PORT` | Puerto HTTP del BFF | `3000` |

En Kubernetes, las direcciones son `sesiones:9090`, `usuarios:9090` y `material:9090`.

## Levantarlo

`npm run start:dev` levanta el BFF en `http://localhost:3000` y lo reinicia con cada cambio de archivo.

PowerShell 5.1 no acepta `&&` ni `VAR=valor comando`: las variables se definen con `$env:` y los comandos se separan con `;`. Las variables quedan definidas hasta que cierras esa ventana de PowerShell.

### 1. Solo con mocks

No necesita nada más que el BFF.

```bash
npm run start:dev
```

### 2. Con Sesiones real

Levanta Sesiones según su README (repo `Sesiones-TutorMatch`); su gRPC queda en el puerto 9090.

Git Bash:

```bash
SESIONES_GRPC_URL=localhost:9090 npm run start:dev
```

PowerShell:

```powershell
$env:SESIONES_GRPC_URL="localhost:9090"; npm run start:dev
```

### 3. Con Usuarios real (servicio de Pablo)

1. Levanta Usuarios según su README (repo `pablofgx-code/tutormatch-usuarios`). Si no tienes Go, usa su `Dockerfile`. Si el puerto 5432 está ocupado, publica su Postgres en otro puerto (por ejemplo, 55433). Su gRPC escucha por defecto en el 50051.
2. Usa en el BFF **el mismo `JWT_SECRET`** que en Usuarios. Si no coinciden, los tokens que emite Usuarios no pasan la verificación del BFF y todas las operaciones con token responden `UNAUTHENTICATED`.

Git Bash:

```bash
USUARIOS_GRPC_URL=localhost:50051 SESIONES_GRPC_URL=localhost:9090 JWT_SECRET=el-mismo-de-usuarios npm run start:dev
```

PowerShell:

```powershell
$env:USUARIOS_GRPC_URL="localhost:50051"; $env:SESIONES_GRPC_URL="localhost:9090"; $env:JWT_SECRET="el-mismo-de-usuarios"; npm run start:dev
```

Para que Sesiones también valide los ramos contra Usuarios real, levántalo con su propio `USUARIOS_GRPC_URL` apuntando al mismo servidor.

### 4. Con Docker

La imagen se construye desde la raíz del repo, con el submódulo `contracts/` descargado (los `.proto` van dentro de la imagen):

```bash
docker build -t bff .
```

La imagen corre con `NODE_ENV=production`, así que **exige `JWT_SECRET`** y no expone GraphiQL. Sin las variables `*_GRPC_URL` usa los mocks:

```bash
docker run --rm -p 3000:3000 -e JWT_SECRET=un-secreto bff
```

Para conectarla a servicios que corren en tu máquina, usa `host.docker.internal` en vez de `localhost`:

```bash
docker run --rm -p 3000:3000 -e JWT_SECRET=el-mismo-de-usuarios -e SESIONES_GRPC_URL=host.docker.internal:9090 -e USUARIOS_GRPC_URL=host.docker.internal:50051 bff
```

Para comprobar que responde:

```bash
curl -s http://localhost:3000/graphql -H "content-type: application/json" -d '{"query":"{ ramos { codigo } }"}'
```

En la imagen, el esquema GraphQL se arma en memoria: no se escribe `schema.gql`.

## Probar con GraphiQL

Abre `http://localhost:3000/graphql` en el navegador.

- **Sin token:** `registro`, `login`, `ramos`, `tutoresPorRamo`, `disponibilidad`, `buscarDisponibilidad`, `sesiones` y `sesion`.
- **Con token:** todo lo demás. Copia el `token` que devuelven `registro` o `login` y pégalo en la pestaña **Headers**, abajo:

```json
{ "Authorization": "Bearer eyJhbGciOiJIUzI1NiIs..." }
```

El token dura 24 horas.

### Bloques horarios

Las casillas de disponibilidad son los bloques de clase de la universidad: 90 minutos, **de lunes a viernes**, en hora de Chile.

| Bloque | A | B | C | D | E | F |
|---|---|---|---|---|---|---|
| Inicio (Chile) | 08:10 | 09:55 | 11:40 | 14:30 | 16:15 | 18:00 |

El BFF recibe y devuelve las fechas en **UTC**. Para convertir, suma 3 horas en horario de verano (septiembre a abril) y 4 en horario de invierno. Ejemplo: el bloque D del lunes 23 de noviembre de 2026 (14:30 en Chile) es `"2026-11-23T17:30:00Z"`.

Solo se aceptan casillas futuras: si la fecha del ejemplo ya pasó, usa la de un lunes próximo.

### Recorrido de ejemplo

**1. La tutora se registra.** Guarda el `token` y el `id`.

```graphql
mutation {
  registro(input: { nombre: "Ana Tutora", email: "ana@uc.cl", password: "secreta123" }) {
    token
    usuario { id esTutor }
  }
}
```

**2. Se inscribe como tutora de un ramo** (con su token en Headers). Los códigos salen de la query `ramos`.

```graphql
mutation {
  agregarRamosTutor(ramos: [{ ramoCodigo: "MAT1610", notaAprobacion: 6.5, periodoAprobacion: "2025-2" }]) {
    esTutor
    ramos { ramo { codigo nombre } activo }
  }
}
```

**3. Marca una casilla** (bloque D del lunes).

```graphql
mutation {
  marcarCasilla(ramoCodigo: "MAT1610", inicio: "2026-11-23T17:30:00Z") {
    id inicio fin libre
  }
}
```

**4. El alumno se registra** y su `token` pasa a la pestaña Headers.

```graphql
mutation {
  registro(input: { nombre: "Beto Alumno", email: "beto@uc.cl", password: "secreta123" }) {
    token
    usuario { id }
  }
}
```

**5. Reserva la casilla.** Solo se envía el `inicio`: el BFF calcula el fin (90 minutos). Usa el `id` de la tutora del paso 1.

```graphql
mutation {
  crearSesion(input: { tutorId: "ID_DE_LA_TUTORA", ramoCodigo: "MAT1610", inicio: "2026-11-23T17:30:00Z" }) {
    id estado inicio fin
    tutor { nombre }
  }
}
```

**6. La semana de la tutora**, con casillas y reservas en una sola consulta:

```graphql
{
  disponibilidad(tutorId: "ID_DE_LA_TUTORA", desde: "2026-11-23T00:00:00Z", hasta: "2026-11-28T00:00:00Z") {
    id ramoCodigo inicio libre
  }
  sesiones(tutorId: "ID_DE_LA_TUTORA", desde: "2026-11-23T00:00:00Z", hasta: "2026-11-28T00:00:00Z") {
    id estado inicio
    estudiante { nombre }
  }
}
```

Para avisar de reservas nuevas, el front repite `sesiones(tutorId: ..., estado: PENDIENTE)` cada 30 a 60 segundos (`pollInterval` de Apollo Client).

**7. La tutora inicia sesión y confirma.** El token de `login` va a Headers.

```graphql
mutation {
  login(input: { email: "ana@uc.cl", password: "secreta123" }) { token }
}
```

```graphql
mutation {
  confirmarSesion(id: "ID_DE_LA_SESION") { estado }
}
```

Las sesiones confirmadas pasan solas a `FINALIZADA` cuando termina el bloque (una tarea programada de Sesiones). La tutora también puede adelantarlo con `finalizarSesion`. Cualquiera de los dos puede cancelar con `cancelarSesion`.

## Material y evaluaciones

**Avisos.** Solo puede publicar quien tenga el ramo activo como tutor. La query `material` devuelve solo lo que el usuario del token puede ver: lo suyo, o el material de un tutor en un ramo si tiene o tuvo una sesión no cancelada con él en ese ramo.

```graphql
mutation {
  publicarAviso(ramoCodigo: "MAT1610", titulo: "Para el lunes", texto: "Traigan calculadora") { id }
}
```

```graphql
{
  material(ramoCodigo: "MAT1610") {
    id tipo titulo texto creadoEn
    archivo { nombre tipoMime tamanoBytes }
  }
}
```

**Evaluaciones.** El alumno evalúa una sesión `FINALIZADA` en la que participó, una sola vez, con una nota de 1 a 5. Las evaluaciones son anónimas: `evaluacionesTutor` no devuelve quién la escribió ni de qué sesión es.

```graphql
mutation {
  evaluar(sesionId: "ID_DE_LA_SESION", nota: 5, comentario: "Explica muy bien") { nota }
}
```

```graphql
{
  evaluacionesTutor(tutorId: "ID_DE_LA_TUTORA") {
    promedio cantidad
    evaluaciones { ramoCodigo nota comentario creadaEn }
  }
}
```

El promedio también está en cada `Usuario` (`promedioEvaluaciones` y `cantidadEvaluaciones`), por ejemplo en `tutoresPorRamo`.

**Archivos (REST, no GraphQL).** Solo PDF, PNG o JPEG, de hasta 10 MB. El BFF revisa además los primeros bytes: un `.exe` renombrado a `.pdf` se rechaza.

Subir (multipart con `archivo`, `ramoCodigo` y `titulo`); responde el `Material` creado:

```bash
curl -H "Authorization: Bearer $TOKEN" -F "archivo=@guia.pdf;type=application/pdf" -F ramoCodigo=MAT1610 -F titulo="Guia de integrales" http://localhost:3000/archivos
```

Descargar, con el `id` del material:

```bash
curl -H "Authorization: Bearer $TOKEN" -o guia.pdf http://localhost:3000/archivos/ID_DEL_MATERIAL
```

En PowerShell 5.1, `curl` es un alias de otro comando: escribe `curl.exe` y reemplaza `$TOKEN` por el token. Los títulos con tildes pueden llegar mal desde la consola de Windows; desde el front (UTF-8) llegan bien.

## Errores

En GraphQL, el tipo de error está en `errors[0].extensions.code`:

| `extensions.code` | Cuándo |
|---|---|
| `BAD_REQUEST` | Datos inválidos: horario que no es un bloque o ya pasó, reservarse a sí mismo, nota fuera de 1 a 5 |
| `UNAUTHENTICATED` | Sin token, token vencido o inválido, o email y contraseña incorrectos |
| `FORBIDDEN` | No participa en la sesión, la casilla o el material no es suyo, solo el tutor confirma o finaliza, publicar material sin tener el ramo activo |
| `NOT_FOUND` | No existe, o no tiene permiso para verlo |
| `CONFLICT` | Casilla ocupada o solapada, cruce de horario, marcar o reservar en un ramo que el tutor no tiene activo, transición de estado inválida, email repetido, sesión ya evaluada |
| `SERVICE_UNAVAILABLE` | Un servicio no responde |

`/archivos` usa códigos HTTP, con el cuerpo `{ statusCode, message, error }`:

| Código | Cuándo |
|---|---|
| 400 | Falta un campo, el archivo no es PDF, PNG ni JPEG de verdad, o se pidió descargar un aviso |
| 401 | Sin token o token inválido |
| 403 | No tiene ese ramo activo como tutor |
| 404 | El material no existe o no puede verlo |
| 413 | Más de 10 MB |
| 503 | Material no responde |

## Tests y calidad

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run test:e2e
```

```bash
npm run test:cov
```

`test:cov` falla si alguna métrica (líneas, sentencias, ramas o funciones) queda bajo 60%. Los adaptadores gRPC se prueban contra un servidor gRPC falso (`test/servidor-grpc-falso.ts`) que usa los `.proto` reales del submódulo.

El CI (`.github/workflows/ci.yml`, GitHub Actions) corre en cada push y pull request: `npm ci`, lint, `test:cov`, `test:e2e` y `docker build`. La imagen no se publica todavía.

## Problemas conocidos

- **Los mocks se borran al reiniciar**, y `start:dev` reinicia el BFF con cada cambio de archivo. Para una demo sin cambios de código, usa `npm run build` y luego `npm run start:prod`.
- **Puerto 5432 ocupado:** si otro proyecto ya usa el 5432, publica el Postgres de cada servicio en otro puerto (Sesiones usa el 55432 y Usuarios, por ejemplo, el 55433).
- **El token dura 24 horas.** Al vencer, todas las operaciones con token dan `UNAUTHENTICATED`; hay que volver a hacer `login`.
- **`JWT_SECRET` distinto entre Usuarios y el BFF:** todas las operaciones con token dan `UNAUTHENTICATED`, aunque el login funcione.
- **Algunas queries no piden token** (`sesiones`, `disponibilidad`, `tutoresPorRamo`, entre otras), así que cualquiera puede leer esos datos.
