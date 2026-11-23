# Imagen del BFF. Se construye desde la raíz del repo, con el submódulo contracts/
# descargado (git clone --recurse-submodules):
#   docker build -t bff .
# JWT_SECRET y las direcciones de los servicios llegan por variables de entorno (ver README).

# ---- Etapa 1: compilar ---------------------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src src
RUN npm run build

# ---- Etapa 2: imagen final, solo con dependencias de producción ----------------------------
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /build/dist dist
# Los adaptadores gRPC leen los .proto en tiempo de ejecución desde ./contracts/proto.
COPY contracts/proto contracts/proto

# La imagen oficial de Node ya trae el usuario sin privilegios "node".
USER node
EXPOSE 3000

CMD ["node", "dist/main"]
