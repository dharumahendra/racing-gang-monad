import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { CARS, EntryKind } from '@racing-gang/config';
import type { Hex } from '@racing-gang/config/protocol';
import { auditRun, replay } from '@racing-gang/sim';
import { mockBlockHash } from '../src/chain/mock';
import { computeSeed } from '../src/chain/seed';
import { rooms, runEntries, runs } from '../src/db/schema';
import { READY_TIMEOUT_MS, RUN_TIMEOUT_MS } from '../src/services/runs';
import { login, makeTestApp } from './helpers';
import { connect, createRun, playToEnd, startPlayer, tick, waitFor } from './play';

let t: Awaited<ReturnType<typeof makeTestApp>>;
beforeEach(async () => { t = await makeTestApp(); });
afterEach(async () => { await t.close(); });

const runRow = (id: string) => t.db.select().from(runs).where(eq(runs.id, id)).get()!;

describe('POST /runs', () => {
  it('membuat run dengan seed dari blockhash(latest − 3)', async () => {
    const { token, account } = await login(t);
    const res = await createRun(t, token);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(BigInt(body.seedBlock)).toBe(t.chain.blockNumber() - 3n);
    expect(body.seed).toBe(computeSeed(mockBlockHash(BigInt(body.seedBlock)), body.runId, account.address));
    expect(runRow(body.runId)).toMatchObject({ lifecycle: 'CREATED', chainStatus: 'PENDING', address: account.address });
    expect(t.chain.relayer.queueSize()).toBe(1); // RunStart
  });

  it('menolak run kedua saat masih ada run aktif', async () => {
    const { token } = await login(t);
    expect((await createRun(t, token)).statusCode).toBe(200);
    const second = await createRun(t, token);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('ACTIVE_RUN_EXISTS');
  });

  it('menolak tier yang tidak dimiliki dan tier tidak valid', async () => {
    const { token } = await login(t);
    expect((await createRun(t, token, { carTier: 1 })).json().error.code).toBe('CAR_NOT_OWNED');
    expect((await createRun(t, token, { carTier: 9 })).json().error.code).toBe('BAD_REQUEST');
  });

  it('batas 20 run per jam', async () => {
    const { token, account } = await login(t);
    const now = t.clock.now();
    t.db.insert(runs).values(Array.from({ length: 20 }, (_, i) => ({
      id: `0x${i.toString(16).padStart(64, '0')}`, address: account.address, carTier: 0, seed: '0x', seedBlock: 1,
      configVersion: 1, lifecycle: 'ENDED' as const, chainStatus: 'PENDING' as const, createdAt: now - 1000,
    }))).run();
    expect((await createRun(t, token)).json().error.code).toBe('RUN_LIMIT');
    t.clock.advance(3_600_001);
    expect((await createRun(t, token)).statusCode).toBe(200);
  });

  it('aturan room: tidak ada, kedaluwarsa, bukan host', async () => {
    const { token, account } = await login(t);
    const other = await login(t, 'player-2');
    const now = t.clock.now();
    t.db.insert(rooms).values([
      { code: 'AAAAAA', hostAddress: account.address, createdAt: now, expiresAt: now - 1 },
      { code: 'BBBBBB', hostAddress: other.account.address, createdAt: now, expiresAt: now + 60_000 },
    ]).run();
    expect((await createRun(t, token, { carTier: 0, roomCode: 'ZZZZZZ' })).json().error.code).toBe('ROOM_NOT_FOUND');
    expect((await createRun(t, token, { carTier: 0, roomCode: 'aaaaaa' })).json().error.code).toBe('ROOM_EXPIRED');
    expect((await createRun(t, token, { carTier: 0, roomCode: 'BBBBBB' })).json().error.code).toBe('NOT_ROOM_HOST');
  });
});

describe('/ws/play dan verifikasi', () => {
  it('token tidak valid → error lalu koneksi ditutup', async () => {
    const msgs: unknown[] = [];
    let closeCode = 0;
    // Server langsung menutup koneksi, jadi promise injectWS tidak ditunggu.
    void t.app.injectWS('/ws/play?token=palsu', {}, {
      onInit: (ws) => {
        ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
        ws.on('close', (code) => { closeCode = code; });
      },
    }).catch(() => {});
    await waitFor(() => closeCode !== 0, 'close', 20_000);
    expect(closeCode).toBe(4401);
    expect(msgs[0]).toMatchObject({ t: 'error', code: 'UNAUTHORIZED' });
  });

  it('run penuh: mepet backend = mepet lokal, log bisa di-replay, koin dikredit dari event chain', async () => {
    const p = await startPlayer(t);
    await playToEnd(t, p, (step) => { if (step % 1 === 0) p.client.snapshot(); });

    const { result, localNearMisses, verified } = p.client;
    expect(result).toMatchObject({ status: 'VERIFIED', reason: p.client.sim.endReason, endTick: p.client.sim.tick });
    expect(localNearMisses.length).toBeGreaterThan(0);
    expect(verified.map((v) => [v.index, v.tick, v.vehicleType, v.coins])).toEqual(
      localNearMisses.map((e) => [e.index, e.tick, e.vehicleType, e.coins]),
    );

    // Audit: log di DB (urut ord) di-replay → hasil sama dengan backend.
    const row = runRow(p.run.runId);
    expect(row).toMatchObject({ lifecycle: 'ENDED', result: 'VERIFIED', nearMisses: localNearMisses.length, finalHash: p.client.sim.inputHash });
    expect(JSON.parse(row.flags)).toEqual([]);
    const entries = t.db.select().from(runEntries).where(eq(runEntries.runId, p.run.runId)).orderBy(asc(runEntries.ord)).all();
    const rep = replay({ runId: p.run.runId, seed: p.run.seed, carTier: 0, entries });
    expect(rep.finalHash).toBe(row.finalHash);
    expect(rep.nearMisses).toBe(row.nearMisses);
    const log = (await t.app.inject({ method: 'GET', url: `/runs/${p.run.runId}/log` })).json();
    expect(log.entries).toEqual(entries.map((e) => ({ tick: e.tick, kind: e.kind, data: e.data })));

    // Chain: relayer mencatat semua mepet → nearMiss.recorded, koin dikredit, run tercatat selesai.
    while (t.chain.relayer.queueSize() > 0) await t.chain.flush(); // maks 60 mepet per batch
    await waitFor(() => p.client.recorded.length === localNearMisses.length, 'nearMiss.recorded');
    expect(runRow(p.run.runId).chainStatus).toBe('RECORDED');
    const me = (await t.app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${p.token}` } })).json();
    const coins = localNearMisses.reduce((s, e) => s + e.coins, 0);
    expect(me).toMatchObject({ coins, coinsPending: 0, bestRun: { runId: p.run.runId, nearMisses: localNearMisses.length } });
    if (localNearMisses.length >= CARS[1].reqNearMiss) {
      await waitFor(() => p.client.qualified.length > 0, 'run.qualified');
      expect(me.qualifiedTiers).toContain(1);
    }

    const summary = (await t.app.inject({ method: 'GET', url: `/runs/${p.run.runId}` })).json();
    expect(summary.nearMissList.every((n: { txHash: string | null }) => n.txHash !== null)).toBe(true);
    expect(summary.finalHash).toBe(p.client.sim.inputHash);

    // Audit dari luar: log publik + catatan backend → semua cocok (sama dengan scripts/audit.ts).
    const audit = auditRun(
      { runId: log.runId, seed: log.seed, carTier: log.carTier, entries: log.entries },
      {
        nearMisses: summary.nearMissList,
        end: { endTick: summary.endTick, totalNearMisses: summary.nearMisses, finalInputHash: summary.finalHash },
      },
    );
    expect(audit.problems).toEqual([]);
    expect((await t.app.inject({ method: 'GET', url: '/health' })).json().activeRuns).toBe(0);
  });

  it('log hanya tersedia setelah run selesai', async () => {
    const p = await startPlayer(t);
    const res = await t.app.inject({ method: 'GET', url: `/runs/${p.run.runId}/log` });
    expect(res.json().error.code).toBe('RUN_NOT_ENDED');
  });

  it('speedhack: watermark jauh di depan jam server → INVALID', async () => {
    const p = await startPlayer(t);
    p.client.ready();
    await waitFor(() => p.client.startAt !== null);
    t.clock.set(p.client.startAt! + 1000); // estTick = 30
    p.client.watermark(30 + 31);
    await waitFor(() => p.client.result !== null, 'run.result');
    expect(p.client.result).toMatchObject({ status: 'INVALID', reason: 'TIMEOUT' });
    expect(JSON.parse(runRow(p.run.runId).flags)).toContain('SPEEDHACK');
  });

  it('watermark selama hitung mundur tidak dianggap speedhack (toleransi 30 tick)', async () => {
    const p = await startPlayer(t);
    p.client.ready();
    await waitFor(() => p.client.startAt !== null);
    t.clock.set(p.client.startAt! - 2000); // masih hitung mundur
    p.client.watermark(0);
    p.client.watermark(30);
    await tick();
    await tick();
    expect(runRow(p.run.runId).lifecycle).not.toBe('ENDED');
    p.client.watermark(31);
    await waitFor(() => p.client.result !== null, 'run.result');
    expect(p.client.result?.status).toBe('INVALID');
  });

  it('timeout: pemain menghilang → PARTIAL pada tick terakhir yang terverifikasi', async () => {
    const p = await startPlayer(t);
    await playToEnd(t, p, async (step) => {
      if (step === 20) {
        t.clock.advance(RUN_TIMEOUT_MS);
        t.ctx.runs.checkTimeouts();
        await waitFor(() => p.client.result !== null, 'run.result');
      }
    }).catch(() => {});
    const row = runRow(p.run.runId);
    expect(p.client.result).toMatchObject({ status: 'PARTIAL', reason: 'TIMEOUT' });
    expect(row.endTick).toBe(row.verifiedTick);
    expect(row.endTick).toBeGreaterThan(0);
  });

  it('run yang tidak pernah run.ready ditutup setelah 60 dtk, lalu boleh buat run baru', async () => {
    const p = await startPlayer(t);
    t.clock.advance(READY_TIMEOUT_MS + 1);
    t.ctx.runs.checkTimeouts();
    expect(runRow(p.run.runId)).toMatchObject({ lifecycle: 'ENDED', result: 'PARTIAL', endTick: 0 });
    expect((await createRun(t, p.token)).statusCode).toBe(200);
  });

  it('reconnect di tengah run: run.go dikirim ulang dan run tetap VERIFIED', async () => {
    const p = await startPlayer(t);
    await playToEnd(t, p, async (step) => {
      if (step === 30) {
        expect(p.client.verified.length).toBeGreaterThan(0);
        p.ws.terminate();
        await tick();
        await t.chain.flush(); // mepet tercatat on-chain saat pemain offline: notifikasinya hilang
        let goCount = 0;
        p.ws = await connect(t, p.token, (m) => { if (m.t === 'run.go') goCount++; p.client.handle(m); });
        await waitFor(() => goCount === 1, 'run.go ulang');
      }
    });
    expect(p.client.result?.status).toBe('VERIFIED');
    while (t.chain.relayer.queueSize() > 0) await t.chain.flush(); // maks 60 mepet per batch
    await waitFor(() => p.client.recorded.length === p.client.localNearMisses.length, 'semua nearMiss.recorded');
  });

  it('run selesai saat pemain offline: run.result dikirim saat tersambung lagi', async () => {
    const p = await startPlayer(t);
    await playToEnd(t, p, async (step) => {
      if (step === 20) {
        p.ws.terminate();
        await tick();
        t.clock.advance(RUN_TIMEOUT_MS);
        t.ctx.runs.checkTimeouts(); // server menutup run PARTIAL saat pemain offline
        expect(p.client.result).toBeNull();
        p.ws = await connect(t, p.token, (m) => p.client.handle(m));
        await waitFor(() => p.client.result !== null, 'run.result setelah reconnect');
      }
    });
    expect(p.client.result).toMatchObject({ status: 'PARTIAL', reason: 'TIMEOUT' });
    expect(p.client.verified.length).toBe(runRow(p.run.runId).nearMisses);
  });

  it('klaim run.end yang berbeda → flag CLAIM_MISMATCH; input terlambat → LATE_INPUT', async () => {
    const p = await startPlayer(t);
    await playToEnd(t, p, (step) => { if (step === 10) p.client.input(1, EntryKind.LEFT); });
    p.ws.send(JSON.stringify({ t: 'run.end', tick: 1, reason: 'CRASH', nearMisses: 999, inputHash: `0x${'00'.repeat(32)}` }));
    await waitFor(() => JSON.parse(runRow(p.run.runId).flags).includes('CLAIM_MISMATCH'), 'flag');
    expect(JSON.parse(runRow(p.run.runId).flags)).toContain('LATE_INPUT');
    expect(p.client.result?.status).toBe('VERIFIED');
  });

  it('seed di event RunStarted berbeda → INVALID (SEED_MISMATCH)', async () => {
    const p = await startPlayer(t);
    await t.chain.bus.emit({ type: 'RunStarted', runId: p.run.runId, player: p.account.address, seed: `0x${'11'.repeat(32)}` as Hex, txHash: '0x01', blockNumber: 1n });
    await waitFor(() => p.client.result !== null, 'run.result');
    expect(p.client.result?.status).toBe('INVALID');
    expect(JSON.parse(runRow(p.run.runId).flags)).toContain('SEED_MISMATCH');
  });

  it('gangguan penonton: sim menunggu ack, gangguan masuk log di warnTick, hasil tetap cocok', async () => {
    const p = await startPlayer(t);
    let scheduled = 0;
    await playToEnd(t, p, async (step) => {
      if (step === 5 || step === 40) {
        const s = t.ctx.runs.active(p.account.address);
        const r = s?.scheduleSpectator({ kind: step === 5 ? 'NITRO' : 'SPIKES', lanes: step === 5 ? [] : [1], nick: 'penonton' });
        if (r?.ok) scheduled++;
      }
    });
    expect(scheduled).toBeGreaterThan(0);
    expect(p.client.scheduled).toHaveLength(scheduled);
    expect(p.client.result?.status).toBe('VERIFIED');
    const specRows = t.db.select().from(runEntries).where(eq(runEntries.runId, p.run.runId)).all().filter((e) => e.source === 'SPECTATOR');
    expect(specRows.map((e) => e.tick)).toEqual(p.client.scheduled.filter((d) => d.warnTick <= p.client.sim.tick).map((d) => d.warnTick));
    expect(runRow(p.run.runId).finalHash).toBe(p.client.sim.inputHash);
  });

  it('server restart: run yang belum selesai ditutup PARTIAL lewat replay', async () => {
    const p = await startPlayer(t);
    await playToEnd(t, p, async (step) => { if (step === 15) throw new Error('stop'); }).catch(() => {});
    const before = runRow(p.run.runId);
    expect(before.lifecycle).toBe('RUNNING');
    // Simulasikan restart: buang sesi di memori dengan manager baru di atas DB yang sama.
    const { RunManager } = await import('../src/services/runs');
    const fresh = new RunManager({ db: t.db, chain: t.chain, hub: t.ctx.hub, now: t.clock.now, env: t.env });
    expect(fresh.recoverStaleRuns()).toBe(1);
    const after = runRow(p.run.runId);
    expect(after).toMatchObject({ lifecycle: 'ENDED', result: 'PARTIAL', endTick: before.verifiedTick });
    expect(JSON.parse(after.flags)).toContain('SERVER_RESTART');
  });
});
