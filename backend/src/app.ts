import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { Authenticator } from './auth/guard';
import { NonceStore } from './auth/nonceStore';
import { PrivyAuth } from './auth/privy';
import type { Chain } from './chain/ports';
import type { Db } from './db/client';
import { corsOrigins, type Env } from './env';
import { registerErrorHandler } from './errors';
import { authRoutes } from './routes/auth';
import { configRoutes } from './routes/config';
import { healthRoutes } from './routes/health';
import { leaderboardRoutes } from './routes/leaderboard';
import { meRoutes } from './routes/me';
import { roomRoutes } from './routes/rooms';
import { runRoutes } from './routes/runs';
import { voucherRoutes } from './routes/vouchers';
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
  auth: Authenticator;
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
  /** fetch untuk API server Privy (diganti di test). */
  fetch?: typeof fetch;
};

export async function buildApp(opts: BuildAppOptions): Promise<{ app: FastifyInstance; ctx: AppContext }> {
  const { env, db, chain } = opts;
  const now = opts.now ?? Date.now;
  const hub = new Hub();
  let rooms: RoomManager | undefined;
  const runs = new RunManager({ db, chain, hub, now, env, notifyRoom: (code) => rooms?.broadcastState(code) });
  rooms = new RoomManager({ db, hub, runs, now });
  registerChainHandlers({ db, chain, hub, now, runs });

  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true, bodyLimit: 64 * 1024 });
  registerErrorHandler(app);
  await app.register(cors, { origin: corsOrigins(env), credentials: false });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(websocket, { options: { maxPayload: 4096 } });

  const privy = env.PRIVY_APP_ID && env.PRIVY_VERIFICATION_KEY && env.PRIVY_APP_SECRET
    ? new PrivyAuth(
        { appId: env.PRIVY_APP_ID, verificationKey: env.PRIVY_VERIFICATION_KEY, appSecret: env.PRIVY_APP_SECRET, apiUrl: env.PRIVY_API_URL },
        db,
        { fetch: opts.fetch, now },
      )
    : null;

  const ctx: AppContext = {
    env, db, chain, now, hub, runs, rooms,
    auth: new Authenticator(app, privy, env.ALLOW_SIWE_LOGIN),
    nonces: new NonceStore(now),
    stats: { activeRuns: () => runs.size },
  };

  await healthRoutes(app, ctx);
  await configRoutes(app, ctx);
  await authRoutes(app, ctx);
  await meRoutes(app, ctx);
  await runRoutes(app, ctx);
  await roomRoutes(app, ctx);
  await voucherRoutes(app, ctx);
  await leaderboardRoutes(app, ctx);
  await playSocket(app, ctx);
  await watchSocket(app, ctx);

  return { app, ctx };
}
