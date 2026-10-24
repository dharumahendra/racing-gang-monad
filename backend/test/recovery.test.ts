// Pemulihan run (handoff pekerjaan 5): POST /runs ambigu, dua tab, dan reload penuh.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import type { ActiveRunResponse, CreateRunResponse, PlayC2S, PlayS2C } from '@racing-gang/config/protocol';
import { runs } from '../src/db/schema';
import { RUN_TIMEOUT_MS } from '../src/services/runs';
import { PlayerClient } from '../scripts/lib/playerClient';
import { login, makeTestApp } from './helpers';
import { createRun, tick, waitFor } from './play';

type TestApp = Awaited<ReturnType<typeof makeTestApp>>;
let t: TestApp;

beforeEach(async () => { t = await makeTestApp(); });
afterEach(async () => { await t.close(); });

const KEY_A = 'tabAAAAAAAAAAAAAAAAAAAAA';
const KEY_B = 'tabBBBBBBBBBBBBBBBBBBBBB';

const active = (token?: string) =>
  t.app.inject({ method: 'GET', url: '/runs/active', headers: token ? { authorization: `Bearer ${token}` } : {} });

/** Satu "tab": socket /ws/play dengan kunci halaman sendiri dan PlayerClient yang mencatat pesan. */
async function tab(token: string, run: CreateRunResponse, client: string | null) {
  const msgs: PlayS2C[] = [];
  let closeCode = 0;
  let ws: WebSocket | null = null;
  const pc = new PlayerClient({
    runId: run.runId, seed: run.seed, carTier: 0,
    send: (m: PlayC2S) => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); },
  });
  const q = client ? `&client=${client}` : '';
  ws = await t.app.injectWS(`/ws/play?token=${token}${q}`, {}, {
    onInit: (s) => {
      s.on('message', (d) => { const m = JSON.parse(d.toString()) as PlayS2C; msgs.push(m); pc.handle(m); });
      s.on('close', (c) => { closeCode = c; });
    },
  });
  await tick();
  return { pc, msgs, ws, closeCode: () => closeCode };
}

async function playOut(p: Awaited<ReturnType<typeof tab>>) {
  t.clock.set(p.pc.startAt!);
  for (let step = 0; !p.pc.result; step++) {
    if (step > 2000) throw new Error('run tidak selesai');
    t.clock.advance(100);
    p.pc.advanceTo(p.pc.targetTick(t.clock.now()));
    p.pc.watermark();
    await tick(); await tick();
  }
}

describe('GET /runs/active', () => {
  it('POST berhasil tapi respons hilang: run yang sama ditemukan, POST ulang ditolak tanpa run kedua', async () => {
    const { token } = await login(t, 'a');
    const created = (await createRun(t, token)).json() as CreateRunResponse; // anggap respons ini tidak pernah sampai ke FE

    const found = (await active(token)).json() as ActiveRunResponse;
    expect(found.run).toMatchObject({ runId: created.runId, seed: created.seed, seedBlock: created.seedBlock, lifecycle: 'CREATED', controlled: false });
    expect(found.creating).toBe(false);

    const retry = await createRun(t, token);
    expect(retry.statusCode).toBe(409);
    expect(t.db.select().from(runs).all()).toHaveLength(1);
  });

  it('anonymous dan token palsu ditolak; akun B tidak melihat run aktif akun A', async () => {
    const a = await login(t, 'a');
    const b = await login(t, 'b');
    await createRun(t, a.token);
    expect((await active()).statusCode).toBe(401);
    expect((await active('bukan-token')).statusCode).toBe(401);
    expect((await active(b.token)).json()).toEqual({ run: null, creating: false });
    // Query alamat palsu diabaikan: identitas hanya dari token.
    const spoof = await t.app.inject({ method: 'GET', url: `/runs/active?address=${a.account.address}`, headers: { authorization: `Bearer ${b.token}` } });
    expect(spoof.json()).toEqual({ run: null, creating: false });
  });

  it('tanpa run aktif → null; setelah run selesai → null', async () => {
    const { token } = await login(t, 'a');
    expect((await active(token)).json().run).toBeNull();
    const run = (await createRun(t, token)).json() as CreateRunResponse;
    const p = await tab(token, run, KEY_A);
    p.pc.ready();
    await waitFor(() => p.pc.startAt !== null, 'run.go');
    await playOut(p);
    expect((await active(token)).json().run).toBeNull();
  });
});

describe('satu pengendali per run (dua tab)', () => {
  it('tab B ditolak NOT_CONTROLLER tanpa menutup tab A; run A tetap VERIFIED', async () => {
    const { token } = await login(t, 'a');
    const run = (await createRun(t, token)).json() as CreateRunResponse;
    const a = await tab(token, run, KEY_A);
    a.pc.ready();
    await waitFor(() => a.pc.startAt !== null, 'run.go');
    expect(((await active(token)).json() as ActiveRunResponse).run?.controlled).toBe(true);

    const b = await tab(token, run, KEY_B);
    await waitFor(() => b.closeCode() !== 0, 'tab B ditutup');
    expect(b.closeCode()).toBe(4409);
    expect(b.msgs.some((m) => m.t === 'error' && m.code === 'NOT_CONTROLLER')).toBe(true);
    expect(b.msgs.some((m) => m.t === 'run.go')).toBe(false); // tidak menerima state run
    expect(a.closeCode()).toBe(0);

    await playOut(a);
    expect(a.pc.result?.status).toBe('VERIFIED');
  });

  it('tab tanpa kunci (client lama) juga tidak bisa mengambil alih run yang sudah terikat', async () => {
    const { token } = await login(t, 'a');
    const run = (await createRun(t, token)).json() as CreateRunResponse;
    const a = await tab(token, run, KEY_A);
    a.pc.ready();
    await waitFor(() => a.pc.startAt !== null, 'run.go');
    const legacy = await tab(token, run, null);
    await waitFor(() => legacy.closeCode() !== 0, 'ditutup');
    expect(legacy.closeCode()).toBe(4409);
    expect(a.closeCode()).toBe(0);
  });

  it('reconnect dari halaman yang sama (kunci sama) tetap diterima dan menggantikan socket lama', async () => {
    const { token } = await login(t, 'a');
    const run = (await createRun(t, token)).json() as CreateRunResponse;
    const a = await tab(token, run, KEY_A);
    a.pc.ready();
    await waitFor(() => a.pc.startAt !== null, 'run.go');
    const again = await tab(token, run, KEY_A);
    await waitFor(() => a.closeCode() !== 0, 'socket lama ditutup');
    expect(a.closeCode()).toBe(4000);
    await waitFor(() => again.msgs.some((m) => m.t === 'run.go'), 'run.go dikirim ulang');
    const go = again.msgs.find((m) => m.t === 'run.go') as Extract<PlayS2C, { t: 'run.go' }>;
    expect(go.startAt).toBe(a.pc.startAt); // tidak ada reset waktu mulai/seed
  });

  it('run CREATED tanpa pengendali (respons POST hilang) bisa diadopsi tab baru lalu VERIFIED', async () => {
    const { token } = await login(t, 'a');
    await createRun(t, token); // respons hilang
    const found = ((await active(token)).json() as ActiveRunResponse).run!;
    const b = await tab(token, { runId: found.runId, seed: found.seed, seedBlock: found.seedBlock, configVersion: found.configVersion }, KEY_B);
    b.pc.ready();
    await waitFor(() => b.pc.startAt !== null, 'run.go');
    await playOut(b);
    expect(b.pc.result?.status).toBe('VERIFIED');
    expect(t.db.select().from(runs).all()).toHaveLength(1);
  });

  it('reload penuh saat RUNNING: halaman baru ditolak, run berakhir PARTIAL jujur, lalu boleh run baru', async () => {
    const { token } = await login(t, 'a');
    const run = (await createRun(t, token)).json() as CreateRunResponse;
    const a = await tab(token, run, KEY_A);
    a.pc.ready();
    await waitFor(() => a.pc.startAt !== null, 'run.go');
    t.clock.set(a.pc.startAt! + 3000);
    a.pc.advanceTo(a.pc.targetTick(t.clock.now()));
    a.pc.watermark();
    await tick(); await tick();
    a.ws.terminate(); // halaman ditutup/reload: state sim di memori browser hilang

    const reloaded = await tab(token, run, KEY_B);
    await waitFor(() => reloaded.closeCode() !== 0, 'halaman baru ditolak');
    expect(reloaded.closeCode()).toBe(4409);

    t.clock.set(a.pc.startAt! + RUN_TIMEOUT_MS + 1000);
    t.ctx.runs.checkTimeouts();
    const row = t.db.select().from(runs).all()[0]!;
    expect(row).toMatchObject({ lifecycle: 'ENDED', result: 'PARTIAL', seed: run.seed });
    expect((await active(token)).json().run).toBeNull();
    expect((await createRun(t, token)).statusCode).toBe(200);
  });
});
