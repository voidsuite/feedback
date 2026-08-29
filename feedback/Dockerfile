# --- Stage 1: build the client -------------------------------------------------
FROM oven/bun:1.3-alpine AS build-client
WORKDIR /app/client
COPY client/package.json ./
RUN bun install
COPY client/ ./
ARG VITE_FEEDBACK_URL
ENV VITE_FEEDBACK_URL=$VITE_FEEDBACK_URL
RUN bun run build

# --- Stage 2: install production server deps -----------------------------------
FROM oven/bun:1.3-alpine AS build-server
WORKDIR /app/server
COPY server/package.json ./
RUN bun install --production

# --- Stage 3: runtime -----------------------------------------------------------
FROM oven/bun:1.3-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build-client /app/client/dist ./client/dist
COPY --from=build-server /app/server/node_modules ./server/node_modules
COPY server/ ./server

WORKDIR /app/server
EXPOSE 3009

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3009/health || exit 1

CMD ["bun", "src/index.ts"]
