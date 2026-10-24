import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { NonceStore } from './auth/nonceStore';
import type { Chain } from './chain/ports';
import type { Db } from './db/client';
import { corsOrigins, type Env } from './env';
import { registerErrorHandler } from './errors';
import { authRoutes } from './routes/auth';
import { configRoutes } from './routes/config';
import { healthRoutes } from './routes/health';
import { meRoutes } from './routes/me';
import { roomRoutes } from './routes/rooms';
import { runRoutes } from './routes/runs';
import { registerChainHandlers } from './services/chainEvents';
import { RoomManager } from './services/rooms';
import { RunManager } from './services/runs';
import { Hub } from './ws/hub';
import { playSocket } from './ws/play';
import { watchSocket } from './ws/watch';

/** Dependensi bersama untuk semua route dan layanan. */
export type AppContext = {
  env: Env;
  db: Db;
  chain: Chain;
  now: () => number;
  nonces: NonceStore;
  hub: Hub;
  runs: RunManager;
  rooms: RoomManager;
  stats: { activeRuns: () => number };
};

export type BuildAppOptions = {
  env: Env;
  db: Db;
  chain: Chain;
  now?: () => number;
  logger?: FastifyServerOptions['logger'];
};

export async function buildApp(opts: BuildAppOptions): Promise<{ app: FastifyInstance; ctx: AppContext }> {
  const now = opts.now ?? Date.now;
  const hub = new Hub();
  let rooms: RoomManager | undefined;
  const runs = new RunManager({
    db: opts.db, chain: opts.chain, hub, now, env: opts.env,
    notifyRoom: (code) => rooms?.broadcastState(code),
  });
  rooms = new RoomManager({ db: opts.db, hub, runs, now });
  const ctx: AppContext = {
    env: opts.env,
    db: opts.db,
    chain: opts.chain,
    now,
    nonces: new NonceStore(now),
    hub,
    runs,
    rooms,
    stats: { activeRuns: () => runs.size },
  };
  registerChainHandlers({ db: opts.db, chain: opts.chain, hub, now, runs });

  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true, bodyLimit: 64 * 1024 });
  registerErrorHandler(app);
  await app.register(cors, { origin: corsOrigins(opts.env), credentials: false });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  await app.register(jwt, { secret: opts.env.JWT_SECRET });
  await app.register(websocket, { options: { maxPayload: 4096 } });

  await healthRoutes(app, ctx);
  await configRoutes(app, ctx);
  await authRoutes(app, ctx);
  await meRoutes(app, ctx);
  await runRoutes(app, ctx);
  await roomRoutes(app, ctx);
  await playSocket(app, ctx);
  await watchSocket(app, ctx);

  return { app, ctx };
}
