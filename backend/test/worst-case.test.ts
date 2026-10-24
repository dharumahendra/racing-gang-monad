// Uji skenario terburuk (WORST_CASE_TESTS.md). ID test = ID skenario.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asc, eq, isNull, sql } from 'drizzle-orm';
import { EntryKind, RUN_TICKS } from '@racing-gang/config';
import type { Hex, PlayS2C, RunLogResponse, RunSummaryResponse, VoucherResponse } from '@racing-gang/config/protocol';
import { auditRun } from '@racing-gang/sim';
import { buildApp } from '../src/app';
import { MockChain } from '../src/chain/mock';
import * as seedModule from '../src/chain/seed';
import { coinLedger, nearMisses, reservations, runEntries, runs } from '../src/db/schema';
import { startJobs } from '../src/jobs';
import { addLedgerEntry } from '../src/services/ledger';
import { RUN_TIMEOUT_MS } from '../src/services/runs';
import { login, makeTestApp } from './helpers';
import { connect, createRun, playToEnd, startPlayer, tick, waitFor } from './play';

let t: Awaited<ReturnType<typeof makeTestApp>>;
beforeEach(async () => { t = await makeTestApp(); });
afterEach(async () => { vi.restoreAllMocks(); await t.close(); });

const runRow = (id: string) => t.db.select().from(runs).where(eq(runs.id, id)).get()!;
const flags = (id: string) => JSON.parse(runRow(id).flags) as string[];

/** Invarian utama: hasil backend selalu bisa dihitung ulang dari log publik. */
async function expectAuditOk(runId: Hex) {
  const log = (await t.app.inject({ method: 'GET', url: `/runs/${runId}/log` })).json() as RunLogResponse;
  const s = (await t.app.inject({ method: 'GET', url: `/runs/${runId}` })).json() as RunSummaryResponse;
  const res = auditRun(
    { runId: log.runId, seed: log.seed, carTier: log.carTier, entries: log.entries },
    {
      nearMisses: s.nearMissList.map((n) => ({ index: n.index, tick: n.tick, vehicleType: n.vehicleType, inputHash: n.inputHash })),
      end: { endTick: s.endTick!, totalNearMisses: s.nearMisses, finalInputHash: s.finalHash! },
    },
  );
  expect(res.problems).toEqual([]);
  return { log, summary: s };
}

async function flushAll(chain: MockChain, max = 50) {
  for (let i = 0; i < max && chain.relayer.queueSize() > 0; i++) await chain.flush();
}

// ─── A. Ketahanan dan durabilitas ──────────────────────────────────────────

describe('A. ketahanan', () => {
  it('A2 server mati setelah run selesai, sebelum tercatat on-chain: semua catatan dikirim ulang setelah start', async () => {
    const p = await startPlayer(t);
    await playToEnd(t, p); // relayer belum pernah flush: RunStart, semua mepet, dan RunEnd masih di antrean memori
    const total = p.client.result!.nearMisses;
    expect(total).toBeGreaterThan(0);

    // "Restart": app baru di DB yang sama dengan chain baru (antrean lama hilang).
    const chain2 = new MockChain({ chainId: t.env.CHAIN_ID, now: t.clock.now, intervalMs: 0 });
    const { app: app2, ctx: ctx2 } = await buildApp({ env: t.env, db: t.db, chain: chain2, now: t.clock.now });
    ctx2.runs.recoverStaleRuns();
    await flushAll(chain2);

    expect(runRow(p.run.runId)).toMatchObject({ result: 'VERIFIED', chainStatus: 'RECORDED', nearMisses: total });
    expect(t.db.select().from(nearMisses).where(isNull(nearMisses.recordedAt)).all()).toHaveLength(0);
    const coins = t.db.select({ v: sql<number>`sum(${coinLedger.delta})` }).from(coinLedger).get()!.v;
    expect(coins).toBe(p.client.result!.coins);
    await app2.close();
  });

  it('A2b restart berulang tidak mengirim ulang run yang sudah tercatat', async () => {
    const p = await startPlayer(t);
    await playToEnd(t, p);
    await flushAll(t.chain);
    expect(runRow(p.run.runId).chainStatus).toBe('RECORDED');
    const chain2 = new MockChain({ chainId: t.env.CHAIN_ID, now: t.clock.now, intervalMs: 0 });
    const { app: app2, ctx: ctx2 } = await buildApp({ env: t.env, db: t.db, chain: chain2, now: t.clock.now });
    ctx2.runs.recoverStaleRuns();
    expect(chain2.relayer.queueSize()).toBe(0);
    await app2.close();
  });

  it('A3 error tak terduga saat memproses pesan WS tidak mematikan server', async () => {
    const p = await startPlayer(t);
    p.client.ready();
    await waitFor(() => p.client.startAt !== null);
    const s = t.ctx.runs.active(p.account.address)!;
    const spy = vi.spyOn(s, 'onWatermark').mockImplementation(() => { throw new Error('SQLITE_FULL: database or disk is full'); });
    t.clock.set(p.client.startAt! + 500);
    p.client.watermark(5);
    await waitFor(() => spy.mock.calls.length > 0, 'pesan diproses');
    await tick();
    spy.mockRestore();

    // Pemain lain tetap bisa main sampai selesai, dan pemain yang kena error bisa melanjutkan.
    const q = await startPlayer(t, 'player-2');
    await playToEnd(t, q);
    expect(q.client.result?.status).toBe('VERIFIED');
  });

  it('A4 job berkala yang melempar error tidak mematikan proses', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const errors: unknown[] = [];
    vi.spyOn(t.ctx.runs, 'checkTimeouts').mockImplementation(() => { throw new Error('boom'); });
    const stop = startJobs(t.ctx, { error: (o: unknown) => void errors.push(o) });
    expect(() => vi.advanceTimersByTime(3000)).not.toThrow();
    expect(errors.length).toBeGreaterThanOrEqual(3);
    stop();
    vi.useRealTimers();
  });

  it('A5 RPC mati saat POST /runs → 503 tanpa run nyangkut; RPC mati di tengah run → verifikasi tetap jalan', async () => {
    const { token } = await login(t);
    const orig = t.chain.reads.latestBlockNumber;
    t.chain.reads.latestBlockNumber = async () => { throw new Error('fetch failed'); };
    const res = await createRun(t, token);
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('CHAIN_UNAVAILABLE');
    expect(t.ctx.runs.size).toBe(0);
    expect(t.db.select().from(runs).all()).toHaveLength(0);
    t.chain.reads.latestBlockNumber = orig;

    const p = await startPlayer(t, 'player-2');
    t.chain.reads.latestBlockNumber = async () => { throw new Error('fetch failed'); };
    await playToEnd(t, p);
    expect(p.client.result?.status).toBe('VERIFIED');
    expect(p.client.verified.length).toBe(p.client.localNearMisses.length);
  });

  it('A6 sepuluh kali putus-sambung, termasuk saat gangguan penonton belum di-ack: tetap VERIFIED tanpa mepet ganda', async () => {
    const p = await startPlayer(t);
    let reconnects = 0;
    let dropScheduled = false;
    await playToEnd(t, p, async (step) => {
      // 10 kali putus di ±4 dtk pertama (seed run acak; autopilot bisa tabrakan kalau lebih lama).
      if (step >= 1 && step <= 10) {
        const s = t.ctx.runs.active(p.account.address);
        if (step === 3 && s) {
          // Gangguan dijadwalkan saat pemain sedang offline: pesannya hilang, server menunggu ack.
          p.ws.terminate();
          await tick();
          dropScheduled = s.scheduleSpectator({ kind: 'NITRO', lanes: [], nick: 'x' }).ok;
        } else {
          p.ws.terminate();
          await tick();
        }
        t.clock.advance(300); // offline 0,3 dtk; client mengejar setelah sambung lagi
        p.ws = await connect(t, p.token, (m) => p.client.handle(m));
        reconnects++;
      }
    });
    expect(reconnects).toBe(10);
    expect(dropScheduled).toBe(true);
    expect(p.client.result?.status).toBe('VERIFIED');
    const rows = t.db.select().from(nearMisses).where(eq(nearMisses.runId, p.run.runId)).all();
    expect(rows.length).toBe(p.client.result!.nearMisses);
    expect(new Set(rows.map((r) => r.idx)).size).toBe(rows.length);
    await expectAuditOk(p.run.runId);
  });

  it('A7 dua tab: koneksi lama ditutup 4000, run tetap benar lewat koneksi baru', async () => {
    const p = await startPlayer(t);
    let oldClosed = 0;
    p.ws.on('close', (c) => { oldClosed = c; });
    p.ws = await connect(t, p.token, (m) => p.client.handle(m));
    await waitFor(() => oldClosed !== 0, 'koneksi lama ditutup');
    expect(oldClosed).toBe(4000);
    await playToEnd(t, p);
    expect(p.client.result?.status).toBe('VERIFIED');
  });
});

// ─── B. Integritas dan keamanan ────────────────────────────────────────────

describe('B. integritas', () => {
  it('B1 dua POST /runs bersamaan (double-click): hanya satu run', async () => {
    const { token, account } = await login(t);
    const res = await Promise.all([createRun(t, token), createRun(t, token), createRun(t, token)]);
    expect(res.map((r) => r.statusCode).sort()).toEqual([200, 409, 409]);
    expect(t.db.select().from(runs).where(eq(runs.address, account.address)).all()).toHaveLength(1);
    expect(t.ctx.runs.size).toBe(1);
  });

  it('B2 dua permintaan voucher bersamaan: koin disisihkan sekali, voucher sama', async () => {
    const { token, account } = await login(t);
    t.chain.qualified.set(`${account.address}:1`, `0x${'aa'.repeat(32)}`);
    addLedgerEntry(t.db, account.address, 3000, 'seed', t.clock.now());
    const req = () => t.app.inject({ method: 'POST', url: '/vouchers', headers: { authorization: `Bearer ${token}` }, payload: { tier: 1 } });
    const res = await Promise.all([req(), req(), req()]);
    expect(res.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(new Set(res.map((r) => (r.json() as VoucherResponse).voucher.nonce)).size).toBe(1);
    expect(t.db.select().from(reservations).all()).toHaveLength(1);
  });

  it('B3 slow-motion: client tetap online tapi tertinggal terus dari jam → flag SLOW_CLIENT', async () => {
    const p = await startPlayer(t);
    p.client.ready();
    await waitFor(() => p.client.startAt !== null);
    t.clock.set(p.client.startAt!);
    // Game dijalankan setengah kecepatan: tiap 100 ms jam, client hanya maju 50 ms.
    for (let step = 0; step < 300 && !p.client.result; step++) {
      t.clock.advance(100);
      p.client.advanceTo(p.client.targetTick(p.client.startAt! + (t.clock.now() - p.client.startAt!) / 2));
      p.client.watermark();
      await tick();
    }
    expect(flags(p.run.runId)).toContain('SLOW_CLIENT');
  });

  it('B3b putus 20 dtk lalu mengejar: bukan slow-motion', async () => {
    const p = await startPlayer(t);
    await playToEnd(t, p, async (step) => {
      if (step === 50) {
        p.ws.terminate();
        await tick();
        t.clock.advance(20_000);
        p.ws = await connect(t, p.token, (m) => p.client.handle(m));
      }
    });
    expect(p.client.result?.status).toBe('VERIFIED');
    expect(flags(p.run.runId)).not.toContain('SLOW_CLIENT');
  });

  it('B4 pemain menolak gangguan (applied=false) padahal masih jauh sebelum warnTick → flag DISRUPTION_DODGE', async () => {
    const p = await startPlayer(t);
    const handle = p.client.handle.bind(p.client);
    // Client curang: semua gangguan dijawab applied=false.
    p.client.handle = (m: PlayS2C) => {
      if (m.t === 'disruption.scheduled') return void p.ws.send(JSON.stringify({ t: 'disruption.ack', id: m.id, applied: false }));
      handle(m);
    };
    await playToEnd(t, p, (step) => {
      if (step === 20) expect(t.ctx.runs.active(p.account.address)!.scheduleSpectator({ kind: 'NITRO', lanes: [], nick: 'x' }).ok).toBe(true);
    });
    expect(flags(p.run.runId)).toContain('DISRUPTION_DODGE');
  });

  it('B4b ack applied=false yang memang terlambat (client sudah lewat warnTick) tidak di-flag', async () => {
    const p = await startPlayer(t);
    let sent = false;
    await playToEnd(t, p, async (step) => {
      if (step === 20) {
        const s = t.ctx.runs.active(p.account.address)!;
        // Pesan gangguan tertahan di jaringan: client sudah melewati warnTick saat menerimanya.
        const handle = p.client.handle.bind(p.client);
        const held: PlayS2C[] = [];
        p.client.handle = (m) => (m.t === 'disruption.scheduled' ? void held.push(m) : handle(m));
        sent = s.scheduleSpectator({ kind: 'NITRO', lanes: [], nick: 'x' }).ok;
        t.clock.advance(1000);
        p.client.advanceTo(p.client.targetTick(t.clock.now()));
        p.client.watermark();
        await tick();
        p.client.handle = handle;
        for (const m of held) handle(m);
      }
    });
    expect(sent).toBe(true);
    expect(p.client.result?.status).toBe('VERIFIED');
    expect(flags(p.run.runId)).not.toContain('DISRUPTION_DODGE');
  });

  it('B5 pemain tidak pernah ack gangguan: verifikasi berhenti sebelum warnTick, run PARTIAL saat timeout', async () => {
    const p = await startPlayer(t);
    const handle = p.client.handle.bind(p.client);
    p.client.handle = (m) => { if (m.t !== 'disruption.scheduled') handle(m); };
    let warnTick = 0;
    await playToEnd(t, p, async (step) => {
      if (step === 20) {
        const r = t.ctx.runs.active(p.account.address)!.scheduleSpectator({ kind: 'NITRO', lanes: [], nick: 'x' });
        if (r.ok) warnTick = r.d.warnTick;
      }
      if (step === 200) {
        t.clock.advance(RUN_TIMEOUT_MS);
        t.ctx.runs.checkTimeouts();
        await waitFor(() => p.client.result !== null);
      }
    });
    expect(warnTick).toBeGreaterThan(0);
    expect(p.client.result).toMatchObject({ status: 'PARTIAL', endTick: warnTick - 1 });
    await expectAuditOk(p.run.runId);
  });

  it('B6 fuzz 2.000 pesan acak + pesan > 4 KB: server tidak crash, run lain tetap benar', async () => {
    const { token } = await login(t, 'fuzzer');
    let closes = 0;
    const open = async () => {
      const ws = await connect(t, token, () => {});
      ws.on('close', () => { closes++; });
      return ws;
    };
    let ws = await open();
    let seed = 1;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const values = [null, true, -1, 0, 1, 2 ** 53, -(2 ** 31), 1.5, NaN, '', 'x'.repeat(100), [], {}, '0x' + 'ff'.repeat(32)];
    const types = ['ping', 'run.ready', 'input', 'watermark', 'disruption.ack', 'snapshot', 'run.end', 'zzz', undefined];
    const fields = ['tick', 'kind', 'seq', 'id', 'applied', 'runId', 'clientMs', 'x', 'z', 'speed', 'reason', 'inputHash', '__proto__', 'constructor'];
    for (let i = 0; i < 2000; i++) {
      if (ws.readyState !== 1) ws = await open();
      const m: Record<string, unknown> = { t: types[Math.floor(rnd() * types.length)] };
      for (let k = 0; k < 4; k++) m[fields[Math.floor(rnd() * fields.length)]!] = values[Math.floor(rnd() * values.length)];
      const raw = rnd() < 0.05 ? '{"t":' : rnd() < 0.05 ? JSON.stringify(m).slice(0, 7) : JSON.stringify(m);
      ws.send(raw);
      if (i % 50 === 0) { t.clock.advance(1000); await tick(); }
    }
    ws.send(JSON.stringify({ t: 'ping', clientMs: 1, pad: 'x'.repeat(5000) })); // > maxPayload 4096
    await waitFor(() => ws.readyState === 3, 'koneksi ditutup karena pesan terlalu besar');
    expect(closes).toBeGreaterThan(0);

    const p = await startPlayer(t, 'honest');
    await playToEnd(t, p);
    expect(p.client.result?.status).toBe('VERIFIED');
    await expectAuditOk(p.run.runId);
  });

  it('B6b banjir > 120 pesan/dtk → koneksi ditutup 4429', async () => {
    const { token } = await login(t);
    let code = 0;
    const ws = await connect(t, token, () => {});
    ws.on('close', (c) => { code = c; });
    for (let i = 0; i < 200; i++) ws.send(JSON.stringify({ t: 'ping', clientMs: i }));
    await waitFor(() => code !== 0, 'ditutup');
    expect(code).toBe(4429);
  });

  it('B7 seq loncat, input ganda, ratusan input satu tick, input tick > 3000: hasil tetap = replay log', async () => {
    const p = await startPlayer(t);
    await playToEnd(t, p, (step) => {
      const T = p.client.sim.tick + 5;
      if (step === 10) for (let i = 0; i < 100; i++) p.client.input(T, EntryKind.BRAKE_OFF);
      if (step === 12) {
        p.ws.send(JSON.stringify({ t: 'input', tick: T, kind: 1, seq: 3 })); // seq lama (duplikat)
        p.ws.send(JSON.stringify({ t: 'input', tick: RUN_TICKS + 5, kind: 1, seq: 10_000 }));
        p.ws.send(JSON.stringify({ t: 'input', tick: -1, kind: 1, seq: 10_001 }));
      }
    });
    await expectAuditOk(p.run.runId);
  });

  it('B8 run.ready untuk run milik pemain lain ditolak', async () => {
    const a = await startPlayer(t, 'alice');
    const b = await startPlayer(t, 'bob');
    b.ws.send(JSON.stringify({ t: 'run.ready', runId: a.run.runId }));
    await waitFor(() => b.client.errors.length > 0);
    expect(b.client.errors[0]!.code).toBe('NO_ACTIVE_RUN');
    expect(t.ctx.runs.get(a.run.runId)!.lifecycle).toBe('CREATED');
  });

  it('B9 token palsu: alg none, tanda tangan diubah, kedaluwarsa, sampah → 401', async () => {
    const { token } = await login(t);
    const [h, p, s] = token.split('.');
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const payload = JSON.parse(Buffer.from(p!, 'base64url').toString());
    const other = '0x000000000000000000000000000000000000dEaD';
    const bad = [
      `${b64({ alg: 'none', typ: 'JWT' })}.${p}.`,
      `${h}.${b64({ ...payload, sub: other })}.${s}`,
      `${b64({ alg: 'HS512', typ: 'JWT' })}.${p}.${s}`,
      t.app.jwt.sign({ sub: payload.sub, exp: Math.floor(Date.now() / 1000) - 60 } as { sub: string }),
      'a.b.c',
      'x'.repeat(5000),
    ];
    for (const tok of bad) {
      const res = await t.app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${tok}` } });
      expect(res.statusCode, tok.slice(0, 40)).toBe(401);
    }
  });

  it('B10 injeksi lewat parameter tidak berdampak', async () => {
    const { token } = await login(t);
    const res1 = await t.app.inject({ method: 'GET', url: `/rooms/${encodeURIComponent("' OR 1=1 --")}` });
    expect(res1.statusCode).toBe(404);
    const res2 = await createRun(t, token, { carTier: 0, roomCode: "x';DROP TABLE r" });
    expect(res2.json().error.code).toBe('ROOM_NOT_FOUND');
    expect((await t.app.inject({ method: 'GET', url: '/runs/1%20OR%201=1' })).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'GET', url: '/leaderboard?limit=1;DROP' })).statusCode).toBe(400);
    expect(t.db.select({ n: sql<number>`count(*)` }).from(runs).get()!.n).toBe(0); // tabel masih ada
  });
});

// ─── C. Performa ──────────────────────────────────────────────────────────

describe('C. performa', () => {
  it('C3 log terbesar (±100 input/dtk sepanjang run): tersimpan, bisa diambil, replay cocok', async () => {
    const p = await startPlayer(t);
    await playToEnd(t, p, () => {
      const T = p.client.sim.tick + 3;
      for (let i = 0; i < 10; i++) p.client.input(T, EntryKind.BRAKE_OFF);
    });
    const n = t.db.select({ n: sql<number>`count(*)` }).from(runEntries).where(eq(runEntries.runId, p.run.runId)).get()!.n;
    expect(n).toBeGreaterThan(Math.min(3000, p.client.result!.endTick) * 3);
    const t0 = performance.now();
    const { log } = await expectAuditOk(p.run.runId);
    expect(log.entries.length).toBe(n);
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('C4 seratus run dan koneksi keluar-masuk: memori sesi, hub, dan room kembali kosong', async () => {
    // Login SIWE dibatasi 30/menit per IP, jadi 25 pemain × 4 run.
    const players = [];
    for (let i = 0; i < 25; i++) players.push(await login(t, `p${i}`));
    for (let round = 0; round < 4; round++) {
      for (const [i, pl] of players.entries()) {
        const auth = { authorization: `Bearer ${pl.token}` };
        const roomCode = i % 5 === 0 ? (await t.app.inject({ method: 'POST', url: '/rooms', headers: auth })).json().code : undefined;
        const res = await createRun(t, pl.token, { carTier: 0, ...(roomCode ? { roomCode } : {}) });
        expect(res.statusCode).toBe(200);
        const spectator = roomCode ? await t.app.injectWS(`/ws/watch?room=${roomCode}`) : null;
        let go = false;
        const ws = await connect(t, pl.token, (m) => { if (m.t === 'run.go') go = true; });
        ws.send(JSON.stringify({ t: 'run.ready', runId: res.json().runId }));
        await waitFor(() => go, 'run.go');
        t.ctx.runs.active(pl.account.address)!.finish('PARTIAL', 'TIMEOUT');
        ws.terminate();
        spectator?.terminate();
      }
      await tick();
      await tick();
    }
    expect(t.db.select({ n: sql<number>`count(*)` }).from(runs).get()!.n).toBe(100);
    t.clock.advance(5 * 60_000);
    t.ctx.runs.checkTimeouts();
    expect(t.ctx.runs.size).toBe(0);
    expect(t.ctx.runs.recentSize).toBe(0);
    expect(t.ctx.hub.stats()).toEqual({ players: 0, rooms: 0 });
  });
});

describe('C5 venue demo', () => {
  it('25 pemain di belakang satu IP (Wi-Fi yang sama): buat room + 15 request masing-masing tanpa 429', async () => {
    const players = [];
    for (let i = 0; i < 25; i++) players.push(await login(t, `venue-${i}`));
    const codes: number[] = [];
    for (const pl of players) {
      const auth = { authorization: `Bearer ${pl.token}` };
      codes.push((await t.app.inject({ method: 'POST', url: '/rooms', headers: auth })).statusCode);
      for (let k = 0; k < 15; k++) codes.push((await t.app.inject({ method: 'GET', url: '/me', headers: auth })).statusCode);
    }
    expect(codes.filter((c) => c !== 200)).toEqual([]);
  });

  it('satu pemain tetap dibatasi: POST /rooms > 20/menit → 429', async () => {
    const { token } = await login(t);
    const codes: number[] = [];
    for (let k = 0; k < 22; k++) codes.push((await t.app.inject({ method: 'POST', url: '/rooms', headers: { authorization: `Bearer ${token}` } })).statusCode);
    expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true);
    expect(codes.slice(20)).toEqual([429, 429]);
  });
});

// ─── D. Batas ─────────────────────────────────────────────────────────────

describe('D. batas', () => {
  it('D2 offline sepanjang run lalu watermark 3000 sekaligus: diproses semua dengan cepat, bukan speedhack', async () => {
    // Seed tetap: run penuh dengan >120 pesan setelah input lepas setir ditambahkan.
    vi.spyOn(seedModule, 'computeSeed').mockReturnValue(`0x${'12'.padStart(64, '0')}`);
    const p = await startPlayer(t);
    p.client.ready();
    await waitFor(() => p.client.startAt !== null);
    t.clock.set(p.client.startAt! + 101_000);
    const buffered: string[] = [];
    const send = p.ws.send.bind(p.ws);
    p.ws.send = ((d: string) => void buffered.push(d)) as typeof p.ws.send;
    p.client.advanceTo(RUN_TICKS);
    p.client.watermark();
    p.ws.send = send;
    expect(p.client.sim.tick).toBe(RUN_TICKS);
    expect(buffered.length).toBeGreaterThan(120);
    const t0 = performance.now();
    // Uji backlog verifikasi, bukan banjir pesan (B6b): semua input tetap mendahului
    // satu watermark akhir, tetapi flush dibagi sesuai batas 120 pesan/detik.
    for (let i = 0; i < buffered.length; i++) {
      if (i > 0 && i % 100 === 0) {
        await tick();
        await tick();
        t.clock.advance(1000);
      }
      p.ws.send(buffered[i]!);
    }
    await waitFor(() => p.client.result !== null || p.client.errors.length > 0, 'run.result', 5000);
    expect(p.client.errors).toEqual([]);
    const ms = performance.now() - t0;
    expect(p.client.result?.status).toBe('VERIFIED');
    expect(p.client.result?.endTick).toBe(p.client.sim.tick);
    expect(ms).toBeLessThan(1000);
    await expectAuditOk(p.run.runId);
  });
});

describe('referensi', () => {
  it('run normal tetap lulus audit', async () => {
    const p = await startPlayer(t);
    await playToEnd(t, p);
    const { log } = await expectAuditOk(p.run.runId);
    expect(log.entries.length).toBe(t.db.select().from(runEntries).where(eq(runEntries.runId, p.run.runId)).orderBy(asc(runEntries.ord)).all().length);
  });
});
