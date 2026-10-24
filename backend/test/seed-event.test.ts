// Jalur cadangan SEED_SOURCE=event (BACKEND_PLAN H): seed diambil dari event RunStarted, bukan dihitung server.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Hex } from '@racing-gang/config/protocol';
import { runs } from '../src/db/schema';
import { makeTestApp } from './helpers';
import { playToEnd, startPlayer, tick, waitFor } from './play';

let t: Awaited<ReturnType<typeof makeTestApp>>;
beforeEach(async () => { t = await makeTestApp({ SEED_SOURCE: 'event' }); });
afterEach(async () => { await t.close(); });

describe('SEED_SOURCE=event', () => {
  it('run.go ditahan sampai RunStarted terbaca, lalu membawa seed dari event', async () => {
    const p = await startPlayer(t);
    const gos: { startAt: number; seed?: Hex }[] = [];
    p.ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'run.go') gos.push(m); });
    p.client.ready();
    for (let i = 0; i < 20; i++) await tick();
    expect(gos).toHaveLength(0); // belum ada event RunStarted

    await t.chain.flush(); // relayer mencatat RunStart → event RunStarted dengan seed rumus kontrak
    await waitFor(() => gos.length === 1, 'run.go');
    expect(gos[0]!.seed).toBe(p.run.seed); // mock memakai rumus yang sama → seed sama
    await playToEnd(t, p);
    expect(p.client.result?.status).toBe('VERIFIED');
  });

  it('seed event berbeda: seed server diganti, client memakai seed baru, hasil tetap cocok', async () => {
    const p = await startPlayer(t);
    const chainSeed = `0x${'5e'.repeat(32)}` as Hex;
    p.client.ready();
    await t.chain.bus.emit({ type: 'RunStarted', runId: p.run.runId, player: p.account.address, seed: chainSeed, txHash: '0x01', blockNumber: 1n });
    await waitFor(() => p.client.startAt !== null, 'run.go');
    expect(p.client.sim.seed).toBe(chainSeed);
    expect(t.db.select().from(runs).where(eq(runs.id, p.run.runId)).get()?.seed).toBe(chainSeed);
    await playToEnd(t, p);
    expect(p.client.result?.status).toBe('VERIFIED');
    expect(p.client.verified.length).toBe(p.client.localNearMisses.length);
  });
});
