import type { FastifyInstance } from 'fastify';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { AppContext } from '../app';

/** Jendela statistik event loop: direset setiap 60 dtk supaya angkanya mencerminkan kondisi terkini. */
const LOOP_WINDOW_MS = 60_000;

export async function healthRoutes(app: FastifyInstance, ctx: AppContext) {
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  let windowStart = Date.now();
  app.addHook('onClose', async () => loop.disable());

  app.get('/health', async () => {
    const ms = (ns: number) => Math.round(ns / 1e5) / 10;
    // Jeda event loop > ±50 ms terasa sebagai input/verifikasi yang tersendat bagi semua pemain.
    const eventLoopLagMs = { p50: ms(loop.percentile(50)), p99: ms(loop.percentile(99)), max: ms(loop.max) };
    if (Date.now() - windowStart > LOOP_WINDOW_MS) {
      loop.reset();
      windowStart = Date.now();
    }
    return {
      ok: true,
      chainMode: ctx.chain.mode,
      relayerQueue: ctx.chain.relayer.queueSize(),
      activeRuns: ctx.stats.activeRuns(),
      connections: ctx.hub.stats(),
      /** Mepet terverifikasi → tercatat on-chain, 200 sampel terakhir (PRD §11: median ≤ 2000 ms). */
      onChainLatency: ctx.stats.latency.summary(),
      eventLoopLagMs,
      memoryMb: Math.round(process.memoryUsage().rss / 1e6),
    };
  });
}
