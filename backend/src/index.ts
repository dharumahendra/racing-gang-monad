// Bootstrap server: env → db → chain → app → listen.
import { existsSync } from 'node:fs';
import { buildApp } from './app';
import { createChain } from './chain';
import { openDb } from './db/client';
import { loadEnv } from './env';

if (existsSync('.env')) process.loadEnvFile('.env');
const env = loadEnv();

const { db, close } = openDb(env.DATABASE_URL);
const chain = createChain(env);
const { app } = await buildApp({
  env,
  db,
  chain,
  logger: {
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } } : {}),
  },
});

await chain.start();
await app.listen({ host: env.HOST, port: env.PORT });
app.log.info({ chainMode: chain.mode, chainId: env.CHAIN_ID }, 'Racing Gang backend siap');

let closing = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    if (closing) return;
    closing = true;
    app.log.info({ sig }, 'mematikan server');
    await app.close();
    await chain.stop();
    close();
    process.exit(0);
  });
}
