// Bootstrap server: env → db → chain → app → listen.
import { existsSync } from 'node:fs';
import { buildApp } from './app';
import { createChain } from './chain';
import { MockChain } from './chain/mock';
import { applyDevGrants, parseDevGrants } from './devGrants';
import { openDb } from './db/client';
import { loadEnv } from './env';
import { startJobs } from './jobs';

if (existsSync('.env')) process.loadEnvFile('.env');
const env = loadEnv();

const { db, close } = openDb(env.DATABASE_URL);
const chain = createChain(env, undefined, db);
const { app, ctx } = await buildApp({
  env,
  db,
  chain,
  logger: {
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } } : {}),
  },
});

await chain.start();
if (env.DEV_GRANT_TIERS && chain instanceof MockChain) {
  const granted = applyDevGrants(db, chain, parseDevGrants(env.DEV_GRANT_TIERS));
  app.log.warn({ granted }, 'DEV_GRANT_TIERS aktif: kepemilikan mobil khusus pengembangan (mock), bukan pembelian');
}
const recovered = ctx.runs.recoverStaleRuns();
if (recovered > 0) app.log.warn({ recovered }, 'run yang terputus karena restart ditutup sebagai PARTIAL');
const stopJobs = startJobs(ctx, app.log);

await app.listen({ host: env.HOST, port: env.PORT });
app.log.info({ chainMode: chain.mode, chainId: env.CHAIN_ID }, 'Racing Gang backend siap');

let closing = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    if (closing) return;
    closing = true;
    app.log.info({ sig }, 'mematikan server');
    stopJobs();
    await app.close();
    await chain.stop();
    close();
    process.exit(0);
  });
}
