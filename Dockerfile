# syntax=docker/dockerfile:1

# ---------- Etapa 1: compilar ----------
FROM node:22-alpine AS build
WORKDIR /app

# Corepack instala la versión de pnpm declarada en `packageManager`.
RUN corepack enable

# Solo los manifiestos primero: la capa de dependencias se reutiliza
# mientras no cambien package.json ni el lockfile.
COPY package.json pnpm-lock.yaml ./
# --ignore-scripts evita el script `prepare` (husky), que no aplica en un build.
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm build

# ---------- Etapa 2: servir estáticos ----------
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/angular-enterprise-lab/browser /usr/share/nginx/html
EXPOSE 80
