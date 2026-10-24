# syntax=docker/dockerfile:1
# Image backend Racing Gang. Build dari root repo (workspace pnpm):
#   docker build -f backend/Dockerfile -t racing-gang-backend .
#   docker run -p 8080:8080 -v rg-data:/data --env-file backend/.env racing-gang-backend
# Jalankan SATU instance saja: state run dan room ada di memori (BACKEND_PLAN L).

FROM node:20-bookworm-slim AS deps
WORKDIR /app
# Cadangan kalau binary siap pakai better-sqlite3 tidak tersedia dan harus di-compile.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --prod --filter "@racing-gang/backend..."

FROM node:20-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATABASE_URL=/data/racing-gang.db
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/pnpm-workspace.yaml /app/tsconfig.base.json ./
COPY --from=deps /app/packages/config ./packages/config
COPY --from=deps /app/packages/sim ./packages/sim
COPY --from=deps /app/backend ./backend
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
WORKDIR /app/backend
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/index.ts"]
