import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../app';

export async function healthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/health', async () => ({
    ok: true,
    chainMode: ctx.chain.mode,
    relayerQueue: ctx.chain.relayer.queueSize(),
    activeRuns: ctx.stats.activeRuns(),
    /** Mepet terverifikasi → tercatat on-chain, 200 sampel terakhir (PRD §11: median ≤ 2000 ms). */
    onChainLatency: ctx.stats.latency.summary(),
  }));
}
