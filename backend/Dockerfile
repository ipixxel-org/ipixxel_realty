# ---------------------------------------------------------------------------
# Place this at the project root, next to package.json
# ---------------------------------------------------------------------------

FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma

# ---------------------------------------------------------------------------
# dev — used by docker-compose.yml, hot-reloads via mounted volume
# ---------------------------------------------------------------------------
FROM base AS dev
RUN npm install
RUN ./node_modules/.bin/prisma generate
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ---------------------------------------------------------------------------
# build — compiles TypeScript, used only as an intermediate stage for prod
# ---------------------------------------------------------------------------
FROM base AS build
RUN npm ci
RUN ./node_modules/.bin/prisma generate
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# prod — small final image, prod dependencies only
# ---------------------------------------------------------------------------
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache python3 make g++
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN ./node_modules/.bin/prisma generate
COPY --from=build /app/dist ./dist
ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/src/main.js"]