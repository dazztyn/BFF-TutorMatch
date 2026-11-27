# BFF-TutorMatch

Backend for Frontend de **TutorMatch**, la plataforma donde los estudiantes reservan tutorías con otros estudiantes que aprobaron el ramo. Es la única puerta de entrada del front: recibe GraphQL (y REST para los archivos), verifica el token y reparte cada operación al microservicio que corresponde.

```
Front ──GraphQL──▶ BFF (NestJS) ──gRPC──▶ Sesiones  (Spring Boot)
      ──REST────▶  /archivos    ──gRPC──▶ Usuarios  (Go)
                                ──gRPC──▶ Material  (NestJS)
                                ──REST──▶ Agente    (Go, con Gemini)
```

## Repositorios del proyecto

| Componente | Repositorio | Responsable | Tecnología |
|---|---|---|---|
| Frontend | [IenZAVALA-S/tutormatch-front](https://github.com/IenZAVALA-S/tutormatch-front) | Ien | React + Apollo Client |
| BFF (este repo) | [dazztyn/BFF-TutorMatch](https://github.com/dazztyn/BFF-TutorMatch) | Vicente | NestJS + GraphQL |
| Usuarios | [pablofgx-code/tutormatch-usuarios](https://github.com/pablofgx-code/tutormatch-usuarios) | Pablo | Go + PostgreSQL |
| Sesiones | [dazztyn/Sesiones-TutorMatch](https://github.com/dazztyn/Sesiones-TutorMatch) | Vicente | Spring Boot + PostgreSQL |
| Material y evaluaciones | [IenZAVALA-S/tutormatch-material](https://github.com/IenZAVALA-S/tutormatch-material) | Ien | NestJS + MongoDB |
| Agente (MCP) | [pablofgx-code/tutormatch-agente](https://github.com/pablofgx-code/tutormatch-agente) | Pablo | Go + Gemini |
| Contratos | [dazztyn/Contratos-TutorMatch](https://github.com/dazztyn/Contratos-TutorMatch) | Todo el equipo | `.proto`, eventos Kafka y contrato REST del agente |

## Cómo está hecho

Cada servicio tiene su módulo en `src/` con el mismo patrón **puerto/adaptador**:

| Módulo | Qué hace | Variable que elige el adaptador real |
|---|---|---|
| `src/sesiones/` | Casillas de disponibilidad, reservas y su ciclo de vida | `SESIONES_GRPC_URL` |
| `src/usuarios/` | Registro, login, ramos e inscripción como tutor | `USUARIOS_GRPC_URL` |
| `src/material/` | Avisos, archivos y evaluaciones | `MATERIAL_GRPC_URL` |
| `src/agente/` | Chat con el agente de IA, por REST | `AGENTE_URL` |

- Si la variable existe, el BFF llama al servicio real (por gRPC, o por REST en el caso del agente).
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
| `AGENTE_URL` | Dirección del agente, ej. `http://localhost:8081` | Mock del agente (responde un texto fijo) |
| `AGENTE_TIMEOUT_MS` | Cuánto espera el BFF al agente, en milisegundos | `120000` (2 minutos) |
| `PORT` | Puerto HTTP del BFF | `3000` |

En Kubernetes, las direcciones son `sesiones:9090`, `usuarios:9090`, `material:9090` y `http://agente:8081`.

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

### 4. Con el agente real (servicio de Pablo)

1. En el repo `pablofgx-code/tutormatch-agente`, crea un `.env` con la `GEMINI_API_KEY` (no se sube: lo excluyen su `.gitignore` y su `.dockerignore`) y `BFF_URL=http://host.docker.internal:3000/graphql`, para que el contenedor llegue al BFF de tu equipo.
2. Levántalo con `docker compose up -d --build`. Escucha en el 8081.
3. Arranca el BFF como en el paso anterior, agregando `AGENTE_URL=http://localhost:8081`.

El agente llama al BFF con el token del usuario, así que necesita Usuarios y Sesiones reales (o el BFF con mocks) para buscar tutores y reservar.

### 5. Con Docker

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

- **Sin token:** `registro`, `login`, `ramos`, `tutoresPorRamo`, `disponibilidad` y `buscarDisponibilidad` (son para buscar).
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

El BFF recibe y devuelve las fechas en **UTC**. La diferencia con Chile es de 3 o 4 horas según el horario de verano o de invierno, y las fechas del cambio varían de un año a otro, así que no sumes horas fijas: convierte con la zona `America/Santiago` usando una librería, por ejemplo [`date-fns-tz`](https://github.com/marnusw/date-fns-tz) (o `Temporal`, donde esté disponible). Ejemplo: el bloque D del lunes 23 de noviembre de 2026 (14:30 en Chile) es `"2026-11-23T17:30:00Z"`.

```js
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

// Hora de Chile → UTC, para mandarla al BFF
fromZonedTime('2026-11-23T14:30:00', 'America/Santiago').toISOString(); // "2026-11-23T17:30:00.000Z"
// UTC → hora de Chile, para mostrarla
formatInTimeZone('2026-11-23T17:30:00Z', 'America/Santiago', 'HH:mm'); // "14:30"
```

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

**6. La tutora inicia sesión y ve su semana.** El token de `login` va a Headers: `sesiones` solo muestra las del usuario del token.

```graphql
mutation {
  login(input: { email: "ana@uc.cl", password: "secreta123" }) { token }
}
```

Casillas y reservas en una sola consulta:

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

Para el buscador del alumno, `buscarDisponibilidad` trae las casillas libres de un ramo con su tutor, nombre y calificación incluidos. Los tutores de todas las casillas se piden a Usuarios en una sola llamada.

```graphql
{
  buscarDisponibilidad(ramoCodigo: "MAT1610", desde: "2026-11-23T00:00:00Z", hasta: "2026-11-28T00:00:00Z") {
    id inicio
    tutor { id nombre promedioEvaluaciones cantidadEvaluaciones }
  }
}
```

Para avisar de reservas nuevas, el front repite `sesiones(tutorId: ..., estado: PENDIENTE)` cada 30 a 60 segundos (`pollInterval` de Apollo Client).

**`sesiones` y `sesion` muestran solo lo del usuario del token:**

- Si se manda `tutorId` o `estudianteId`, al menos uno tiene que ser el id del usuario; si no, `FORBIDDEN`. El alumno pide las suyas con `estudianteId` igual a su propio id.
- Sin ninguno de los dos, devuelve las del usuario como tutor y como alumno, ordenadas por `inicio`.
- `sesion(id)` de una sesión en la que el usuario no participa responde `NOT_FOUND`.

**7. La tutora confirma la reserva.**

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

**Desde el navegador**, la descarga también exige la cabecera `Authorization`. Un `<img src="/archivos/...">` o un `<a href="/archivos/...">` no mandan cabeceras y reciben 401: hay que bajar el archivo con `fetch` y mostrarlo desde un object URL.

```js
const res = await fetch(`/archivos/${id}`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) throw new Error(`Error ${res.status}`);
const url = URL.createObjectURL(await res.blob());
// <img src={url}> para una imagen, window.open(url) para un PDF,
// o <a href={url} download={nombre}> para guardarlo. Al terminar: URL.revokeObjectURL(url).
```

Para subir, lo mismo con un `FormData` (`archivo`, `ramoCodigo` y `titulo`) y `method: 'POST'`, sin poner `Content-Type` a mano: el navegador lo arma con su `boundary`.

## Agente

El agente entiende pedidos como "Necesito ayuda con Cálculo II el jueves en la tarde": busca tutores, revisa su disponibilidad y puede crear la reserva. El BFF le reenvía la cabecera `Authorization` del usuario, porque el agente llama al BFF con ese mismo token (por ejemplo, a `crearSesion`).

Con token:

```graphql
mutation {
  chatAgente(mensaje: "Necesito ayuda con Cálculo II el jueves en la tarde") {
    conversacionId
    respuesta
    acciones { tipo id }
  }
}
```

- Para seguir la misma conversación, manda el `conversacionId` que devolvió la respuesta anterior: `chatAgente(mensaje: "...", conversacionId: "...")`.
- `acciones` viene vacía si el agente solo conversó, o trae `{ tipo: "sesion.creada", id }` cuando reservó: el front debería refrescar esa vista.
- El mensaje va de 1 a 2000 caracteres, y el `conversacionId`, hasta 128. El BFF lo valida antes de llamar al agente.
- **Puede tardar hasta unos 2 minutos**, porque el agente encadena varias llamadas a Gemini. Conviene mostrar que está pensando y no reintentar mientras tanto.
- Sin `AGENTE_URL`, el mock responde siempre el mismo texto, sin acciones.

## Para el front (React + Apollo Client)

**Token en cada operación.** Un link de Apollo agrega la cabecera; las queries sin token también funcionan con ella.

```js
import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from '@apollo/client';

const auth = new ApolloLink((operation, forward) => {
  const token = localStorage.getItem('token');
  if (token) {
    operation.setContext(({ headers }) => ({
      headers: { ...headers, Authorization: `Bearer ${token}` },
    }));
  }
  return forward(operation);
});

export const client = new ApolloClient({
  link: auth.concat(new HttpLink({ uri: '/graphql' })),
  cache: new InMemoryCache(),
});
```

**Reservas pendientes del tutor.** Sin websockets: la pantalla principal repite la query cada 30 a 60 segundos con `pollInterval`.

```js
useQuery(PENDIENTES, { variables: { tutorId }, pollInterval: 45_000 });
// PENDIENTES: query { sesiones(tutorId: $tutorId, estado: PENDIENTE) { id inicio ramoCodigo estudiante { nombre } } }
```

**Errores.** Distinguirlos por `extensions.code` del error GraphQL (ver [Errores](#errores)), no por el texto del mensaje. Con `UNAUTHENTICATED`, borrar el token y volver al login.

**Agente.** `chatAgente` puede tardar hasta unos 2 minutos: mostrar que está pensando y no reintentar mientras tanto.

**Proxy en desarrollo.** Con un proxy de Vite hacia el BFF, el navegador ve todo en el mismo origen (`http://localhost:5173`) y no hace falta CORS. El front usa rutas relativas (`/graphql`, `/archivos/...`) y no debe tener páginas propias con esos caminos.

```js
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/graphql': 'http://localhost:3000',
      '/archivos': 'http://localhost:3000',
    },
  },
});
```

**El BFF no habilita CORS, a propósito.** En desarrollo se usa este proxy. En Kubernetes, el ingress publica el front y el BFF bajo el mismo dominio (`/` para el front, `/graphql` y `/archivos` para el BFF). Sin el proxy, el navegador bloquea las peticiones a `http://localhost:3000`.

## Errores

En GraphQL, el tipo de error está en `errors[0].extensions.code`:

| `extensions.code` | Cuándo |
|---|---|
| `BAD_REQUEST` | Datos inválidos: horario que no es un bloque o ya pasó, reservarse a sí mismo, nota fuera de 1 a 5 |
| `UNAUTHENTICATED` | Sin token, token vencido o inválido, o email y contraseña incorrectos |
| `FORBIDDEN` | No participa en la sesión, la casilla o el material no es suyo, solo el tutor confirma o finaliza, publicar material sin tener el ramo activo |
| `NOT_FOUND` | No existe, o no tiene permiso para verlo |
| `CONFLICT` | Casilla ocupada o solapada, cruce de horario, marcar o reservar en un ramo que el tutor no tiene activo, transición de estado inválida, email repetido, sesión ya evaluada |
| `TOO_MANY_REQUESTS` | El agente recibió demasiados mensajes de ese usuario; reintentar en unos segundos |
| `SERVICE_UNAVAILABLE` | Un servicio no responde, o el agente o Gemini no responden a tiempo |
| `GATEWAY_TIMEOUT` | El agente superó su máximo de pasos sin terminar |

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
- **Las queries para buscar no piden token** (`ramos`, `tutoresPorRamo`, `disponibilidad` y `buscarDisponibilidad`), así que cualquiera puede ver los tutores, sus casillas y su promedio. Las sesiones sí exigen token.
