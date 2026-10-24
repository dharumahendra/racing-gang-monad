import type { FastifyInstance } from 'fastify';
import * as gameConfig from '@racing-gang/config';
import type { Address, ConfigResponse } from '@racing-gang/config/protocol';
import type { AppContext } from '../app';

/** Semua konstanta data dari packages/config (fungsi dan helper tidak ikut). */
function constants(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(gameConfig)) {
    if (typeof v !== 'function' && /^[A-Z][A-Z0-9_]*$/.test(k)) out[k] = v;
  }
  out.CARS = gameConfig.CARS.map((c) => ({ ...c, priceWei: gameConfig.monToWei(c.priceMon).toString() }));
  return out;
}

export async function configRoutes(app: FastifyInstance, { env, chain }: AppContext) {
  const deployment = gameConfig.getDeployment();
  const runRegistry = (env.RUN_REGISTRY_ADDRESS ?? deployment?.runRegistry) as Address | undefined;
  const carNFT = (env.CAR_NFT_ADDRESS ?? deployment?.carNFT) as Address | undefined;
  const body: ConfigResponse = {
    configVersion: gameConfig.CONFIG_VERSION,
    chainMode: chain.mode,
    chainId: env.CHAIN_ID,
    explorerUrl: env.EXPLORER_URL ?? deployment?.explorerUrl ?? null,
    contracts: runRegistry && carNFT ? { runRegistry, carNFT } : null,
    constants: constants(),
  };
  app.get('/config', async () => body);
}
