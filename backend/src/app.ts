import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { NonceStore } from './auth/nonceStore';
import type { Chain } from './chain/ports';
import type { Db } from './db/client';
import { corsOrigins, type Env } from './env';
import { registerErrorHandler } from './errors';
import { authRoutes } from './routes/auth';
import { configRoutes } from './routes/config';
import { healthRoutes } from './routes/health';
import { meRoutes } from './routes/me';

/** Dependensi bersama untuk semua route dan layanan. */
export type AppContext = {
  env: Env;
  db: Db;
  chain: Chain;
  now: () => number;
  nonces: NonceStore;
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
  const ctx: AppContext = {
    env: opts.env,
    db: opts.db,
    chain: opts.chain,
    now,
    nonces: new NonceStore(now),
    stats: { activeRuns: () => 0 },
  };

  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true, bodyLimit: 64 * 1024 });
  registerErrorHandler(app);
  await app.register(cors, { origin: corsOrigins(opts.env), credentials: false });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  await app.register(jwt, { secret: opts.env.JWT_SECRET });

  await healthRoutes(app, ctx);
  await configRoutes(app, ctx);
  await authRoutes(app, ctx);
  await meRoutes(app, ctx);

  return { app, ctx };
}
