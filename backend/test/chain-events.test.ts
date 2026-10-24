// Reaksi terhadap event chain (TECH_SPEC §7.2): idempoten untuk event ganda (backfill + subscribe).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Hex } from '@racing-gang/config/protocol';
import { coinLedger, runs } from '../src/db/schema';
import { makeTestApp } from './helpers';
import { playToEnd, startPlayer, waitFor } from './play';

let t: Awaited<ReturnType<typeof makeTestApp>>;
beforeEach(async () => { t = await makeTestApp(); });
afterEach(async () => { await t.close(); });

const TX = `0x${'ab'.repeat(32)}` as Hex;

describe('event chain', () => {
  it('NearMiss dan Qualified yang terbaca dua kali: koin sekali, notifikasi sekali; latensi masuk /health', async () => {
    const p = await startPlayer(t);
    await playToEnd(t, p);
    const n = p.client.localNearMisses.length;
    while (t.chain.relayer.queueSize() > 0) await t.chain.flush();
    await waitFor(() => p.client.recorded.length === n, 'recorded');

    const ledgerBefore = t.db.select().from(coinLedger).all().length;
    const first = p.client.localNearMisses[0]!;
    // Event yang sama diputar ulang (mis. dari backfill setelah restart).
    await t.chain.bus.emit({ type: 'NearMiss', runId: p.run.runId, player: p.account.address, index: first.index, tick: first.tick, vehicleType: first.vehicleType, txHash: TX, blockNumber: 1n });
    await t.chain.bus.emit({ type: 'Qualified', player: p.account.address, tier: 1, runId: p.run.runId, tick: 1, txHash: TX, blockNumber: 1n });
    await t.chain.bus.emit({ type: 'Qualified', player: p.account.address, tier: 1, runId: p.run.runId, tick: 1, txHash: TX, blockNumber: 1n });
    expect(t.db.select().from(coinLedger).all().length).toBe(ledgerBefore);
    expect(p.client.recorded.length).toBe(n);
    await waitFor(() => p.client.qualified.length >= 1, 'run.qualified');
    expect(p.client.qualified.filter((q) => q.tier === 1)).toHaveLength(1);

    const health = (await t.app.inject({ method: 'GET', url: '/health' })).json();
    expect(health.onChainLatency.samples).toBe(n);
    expect(health.onChainLatency.medianMs).toBeGreaterThanOrEqual(0);
    expect(t.db.select().from(runs).where(eq(runs.id, p.run.runId)).get()?.chainStatus).toBe('RECORDED');
  });

  it('RecordFailed: status run RECORD_FAILED dan pemain diberi tahu', async () => {
    const p = await startPlayer(t);
    const errors: string[] = [];
    p.ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.t === 'error') errors.push(m.code); });
    await t.chain.bus.emit({ type: 'RecordFailed', runId: p.run.runId, error: 'SeedBlockInvalid' });
    await waitFor(() => errors.includes('RECORD_FAILED'), 'error RECORD_FAILED');
    expect(t.db.select().from(runs).where(eq(runs.id, p.run.runId)).get()?.chainStatus).toBe('RECORD_FAILED');
  });

  it('NearMiss untuk run yang tidak dikenal server tetap dikredit (ledger mengikuti chain)', async () => {
    const stranger = '0x4444444444444444444444444444444444444444' as const;
    const runId = `0x${'99'.repeat(32)}` as Hex;
    await t.chain.bus.emit({ type: 'NearMiss', runId, player: stranger, index: 1, tick: 10, vehicleType: 1, txHash: TX, blockNumber: 1n });
    const rows = t.db.select().from(coinLedger).where(eq(coinLedger.address, stranger)).all();
    expect(rows.map((r) => [r.delta, r.ref])).toEqual([[200, `${runId}:1`]]);
  });
});
