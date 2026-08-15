# ---- Base: install deps for the whole workspace ----
FROM node:20-alpine AS base
WORKDIR /app
COPY packages/db/package.json packages/db/package.json
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/analytics/package.json packages/analytics/package.json
RUN npm ci

# ---- Build: generate Prisma client, compile TypeScript ----
FROM base AS build
COPY . .
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN npm run build -w packages/db
RUN npm run build -w packages/queue
RUN npm run build -w apps/api

# ---- Runtime: minimal image, only what's needed to run ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/packages ./packages
EXPOSE 3000
EXPOSE 3000
CMD ["node", "apps/api/dist/src/server.js"]