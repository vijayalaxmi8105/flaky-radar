# ---- Base: install deps for the whole workspace ----
FROM node:20-alpine AS base
WORKDIR /app
COPY . .
RUN npm ci

# ---- Build: generate Prisma client, compile TypeScript ----
FROM base AS build
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN npm run build -w packages/db
RUN npm run build -w packages/queue
RUN npm run build -w apps/api