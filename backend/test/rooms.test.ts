import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROOM, SPECTATOR } from '@racing-gang/config';
import { sanitizeNick } from '../src/services/rooms';
import { login, makeTestApp } from './helpers';
import { playToEnd, startPlayer, tick, waitFor, watch } from './play';

let t: Awaited<ReturnType<typeof makeTestApp>>;
beforeEach(async () => { t = await makeTestApp(); });
afterEach(async () => { await t.close(); });

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('REST room', () => {
  it('POST /rooms → kode 6 karakter dari alfabet, berlaku 15 menit; GET /rooms/:code', async () => {
    const { token } = await login(t);
    const res = await t.app.inject({ method: 'POST', url: '/rooms', headers: auth(token) });
    const { code, expiresAt } = res.json();
    expect(code).toMatch(new RegExp(`^[${ROOM.alphabet}]{6}$`));
    expect(expiresAt).toBe(t.clock.now() + ROOM.ttlMs);
    const info = (await t.app.inject({ method: 'GET', url: `/rooms/${code.toLowerCase()}` })).json();
    expect(info).toEqual({ code, expiresAt, spectators: 0, run: null });
    expect((await t.app.inject({ method: 'GET', url: '/rooms/XXXXXX' })).statusCode).toBe(404);
    expect((await t.app.inject({ method: 'POST', url: '/rooms' })).statusCode).toBe(401);
  });

  it('nick disanitasi', () => {
    expect(sanitizeNick('  <b>Budi</b>  ', '7')).toBe('bBudi/b');
    expect(sanitizeNick('', '0012')).toBe('Penonton-0012');
    expect(sanitizeNick('a'.repeat(40), '1')).toHaveLength(16);
  });
});

describe('/ws/watch', () => {
  it('room tidak ada → error ROOM_NOT_FOUND lalu ditutup', async () => {
    const w = await watch(t, 'ZZZZZZ');
    await waitFor(() => w.closeCode() !== 0, 'close', 20_000);
    expect(w.msgs[0]).toMatchObject({ t: 'error', code: 'ROOM_NOT_FOUND' });
  });

  it('masuk tanpa wallet: room.state + energi 100; jumlah penonton ikut ter-update; maksimal 50', async () => {
    const { token } = await login(t);
    const { code } = (await t.app.inject({ method: 'POST', url: '/rooms', headers: auth(token) })).json();
    const a = await watch(t, code, 'Ani');
    await waitFor(() => !!a.last('energy'));
    expect(a.last('room.state')).toMatchObject({ code, spectators: 1, run: null });
    expect(a.last('energy')).toEqual({ t: 'energy', value: SPECTATOR.energyMax });
    const b = await watch(t, code.toLowerCase(), 'Budi');
    await waitFor(() => a.last('room.state')?.spectators === 2, 'spectators 2');
    b.ws.terminate(); // di injectWS, close() menunggu handshake penutupan yang lama
    await waitFor(() => a.last('room.state')?.spectators === 1, 'spectators 1', 20_000);

    const others = [];
    for (let i = 0; i < SPECTATOR.maxPerRoom - 1; i++) others.push(await watch(t, code));
    const full = await watch(t, code);
    await waitFor(() => full.closeCode() !== 0, 'close', 20_000);
    expect(full.msgs[0]).toMatchObject({ t: 'error', code: 'ROOM_FULL' });
  });

  it('room kedaluwarsa tanpa run tidak bisa dimasuki', async () => {
    const { token } = await login(t);
    const { code } = (await t.app.inject({ method: 'POST', url: '/rooms', headers: auth(token) })).json();
    t.clock.advance(ROOM.ttlMs + 1);
    const w = await watch(t, code);
    await waitFor(() => w.closeCode() !== 0, 'close', 20_000);
    expect(w.msgs[0]).toMatchObject({ t: 'error', code: 'ROOM_EXPIRED' });
  });

  it('gangguan tanpa run → NO_RUN; payload salah → BAD_MESSAGE', async () => {
    const { token } = await login(t);
    const { code } = (await t.app.inject({ method: 'POST', url: '/rooms', headers: auth(token) })).json();
    const w = await watch(t, code);
    expect(await w.disrupt({ kind: 'NITRO' })).toEqual({ t: 'disrupt.rejected', reason: 'NO_RUN' });
    w.ws.send(JSON.stringify({ t: 'disrupt', kind: 'RED', lane: 7, durationIndex: 0 }));
    await waitFor(() => w.msgs.some((m) => m.t === 'error'), 'error');
    expect(w.msgs.find((m) => m.t === 'error')).toMatchObject({ code: 'BAD_MESSAGE' });
  });

  it('run di room: penonton melihat status, mengganggu dengan energi, batas, rate, dan hasil run', async () => {
    const p = await startPlayer(t, 'host', { withRoom: true });
    const code = p.roomCode!;
    const ani = await watch(t, code, 'Ani');
    const budi = await watch(t, code, 'Budi');
    await waitFor(() => ani.last('room.state')?.run?.runId === p.run.runId, 'room.state dengan run');
    expect(ani.last('room.state')!.run).toMatchObject({ seed: p.run.seed, carTier: 0, startAt: null });

    // Belum RUNNING (belum ada watermark) → NO_RUN
    expect(await ani.disrupt({ kind: 'NITRO' })).toMatchObject({ reason: 'NO_RUN' });

    const results: Record<string, unknown> = {};
    await playToEnd(t, p, async (step) => {
      if (step === 2) {
        expect(ani.last('room.state')!.run!.startAt).toBe(p.client.startAt);
        p.client.snapshot();
        await waitFor(() => budi.msgs.some((m) => m.t === 'run.snapshot'), 'run.snapshot');
      }
      if (step === 5) {
        results.nitro = await ani.disrupt({ kind: 'NITRO' });
        await waitFor(() => p.client.scheduled.length === 1 && budi.msgs.some((m) => m.t === 'disruption.scheduled'), 'scheduled');
        await waitFor(() => ani.last('energy')?.value === SPECTATOR.energyMax - SPECTATOR.cost.NITRO, 'energi berkurang');
        results.nitro2 = await budi.disrupt({ kind: 'NITRO' });                          // nitro kedua → LIMIT
        results.red7 = await ani.disrupt({ kind: 'RED', lane: 0, durationIndex: 2 });     // 70 < 80 → ENERGY
      }
      if (step === 6) {
        for (let i = 0; i < SPECTATOR.maxMsgPerSec; i++) budi.ws.send(JSON.stringify({ t: 'disrupt', kind: 'NITRO' }));
        await waitFor(() => budi.msgs.some((m) => m.t === 'disrupt.rejected' && m.reason === 'RATE'), 'RATE');
      }
      if (step === 30) {
        // 2,5 dtk kemudian energi Ani terisi lagi (+10/dtk)
        t.ctx.rooms.tickEnergy();
        await tick();
        expect(ani.last('energy')!.value).toBeGreaterThanOrEqual(SPECTATOR.energyMax - SPECTATOR.cost.NITRO + 25);
      }
    });

    expect(results.nitro).toMatchObject({ t: 'disrupt.accepted' });
    expect(results.nitro2).toMatchObject({ reason: 'LIMIT' });
    expect(results.red7).toMatchObject({ reason: 'ENERGY' });
    const sched = p.client.scheduled[0]!;
    expect(sched).toMatchObject({ kind: 'NITRO', by: 'Ani' });
    expect(p.client.result?.status).toBe('VERIFIED');
    await waitFor(() => ani.msgs.some((m) => m.t === 'run.result'), 'run.result ke penonton');
    await waitFor(() => ani.last('room.state')?.run === null, 'room.state tanpa run');
  });

  it('kode room kedaluwarsa saat run berjalan: run selesai normal, gangguan baru ROOM_EXPIRED', async () => {
    const p = await startPlayer(t, 'host', { withRoom: true });
    const w = await watch(t, p.roomCode!);
    let rejected: unknown;
    await playToEnd(t, p, async (step) => {
      if (step === 3) {
        // Lompat sebentar ke setelah kode kedaluwarsa, lalu kembali, supaya run tidak kena timeout.
        const now = t.clock.now();
        t.clock.set(t.ctx.rooms.row(p.roomCode!)!.expiresAt + 1);
        rejected = await w.disrupt({ kind: 'NITRO' });
        t.clock.set(now);
      }
    });
    expect(rejected).toMatchObject({ reason: 'ROOM_EXPIRED' });
    expect(p.client.result?.status).toBe('VERIFIED');
  });
});
