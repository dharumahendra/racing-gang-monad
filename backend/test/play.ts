// Helper test: pemain lewat WebSocket in-process (app.injectWS) dengan jam palsu.
import type { WebSocket } from 'ws';
import type { CreateRunResponse, PlayC2S, PlayS2C, WatchC2S, WatchS2C } from '@racing-gang/config/protocol';
import type { AutopilotOptions } from '@racing-gang/sim/dev';
import { PlayerClient } from '../scripts/lib/playerClient';
import { login, type makeTestApp } from './helpers';

type TestApp = Awaited<ReturnType<typeof makeTestApp>>;

export const tick = () => new Promise((r) => setImmediate(r));

export async function waitFor(cond: () => boolean, label = 'kondisi', max = 500) {
  for (let i = 0; i < max; i++) {
    if (cond()) return;
    await tick();
  }
  throw new Error(`Timeout menunggu ${label}`);
}

export async function connect(t: TestApp, token: string, onMsg: (m: PlayS2C) => void): Promise<WebSocket> {
  // Listener dipasang di onInit supaya pesan yang dikirim server tepat saat koneksi dibuka tidak terlewat.
  return t.app.injectWS(`/ws/play?token=${token}`, {}, {
    onInit: (ws) => ws.on('message', (d) => onMsg(JSON.parse(d.toString()))),
  });
}

export async function createRun(t: TestApp, token: string, body: object = { carTier: 0 }) {
  return t.app.inject({ method: 'POST', url: '/runs', headers: { authorization: `Bearer ${token}` }, payload: body });
}

/** Login, buat run, sambungkan WS, dan siapkan PlayerClient. */
export async function startPlayer(
  t: TestApp,
  label = 'player-1',
  opts: { autopilot?: AutopilotOptions; carTier?: number; withRoom?: boolean } = {},
) {
  const { token, account } = await login(t, label);
  let roomCode: string | undefined;
  if (opts.withRoom) {
    roomCode = (await t.app.inject({ method: 'POST', url: '/rooms', headers: { authorization: `Bearer ${token}` } })).json().code;
  }
  const res = await createRun(t, token, { carTier: opts.carTier ?? 0, ...(roomCode ? { roomCode } : {}) });
  if (res.statusCode !== 200) throw new Error(`POST /runs gagal: ${res.body}`);
  const run = res.json() as CreateRunResponse;
  const out: PlayC2S[] = [];
  let ws: WebSocket | null = null;
  const client = new PlayerClient({
    runId: run.runId, seed: run.seed, carTier: opts.carTier ?? 0, autopilot: opts.autopilot,
    send: (m) => { out.push(m); ws?.send(JSON.stringify(m)); },
  });
  ws = await connect(t, token, (m) => client.handle(m));
  return { token, account, run, client, out, roomCode, get ws() { return ws!; }, set ws(v: WebSocket) { ws = v; } };
}

/** Penonton lewat /ws/watch. `msgs` berisi semua pesan yang diterima. */
export async function watch(t: TestApp, code: string, nick?: string) {
  const msgs: WatchS2C[] = [];
  let closeCode = 0;
  const q = `room=${code}${nick !== undefined ? `&nick=${encodeURIComponent(nick)}` : ''}`;
  const ws = await t.app.injectWS(`/ws/watch?${q}`, {}, {
    onInit: (s) => {
      s.on('message', (d) => msgs.push(JSON.parse(d.toString())));
      s.on('close', (c) => { closeCode = c; });
    },
  });
  const last = <K extends WatchS2C['t']>(k: K) => [...msgs].reverse().find((m) => m.t === k) as Extract<WatchS2C, { t: K }> | undefined;
  const disrupt = async (m: Omit<WatchC2S, 't'>) => {
    const before = msgs.filter((x) => x.t === 'disrupt.accepted' || x.t === 'disrupt.rejected').length;
    ws.send(JSON.stringify({ t: 'disrupt', ...m }));
    await waitFor(() => msgs.filter((x) => x.t === 'disrupt.accepted' || x.t === 'disrupt.rejected').length > before, 'balasan disrupt');
    return [...msgs].reverse().find((x) => x.t === 'disrupt.accepted' || x.t === 'disrupt.rejected')!;
  };
  return { ws, msgs, last, disrupt, closeCode: () => closeCode };
}

/**
 * Mainkan run sampai selesai: jam dimajukan 100 ms per langkah, client mengejar tick target lalu
 * mengirim watermark (seperti frontend). `each` dipanggil setiap langkah untuk skenario khusus.
 */
export async function playToEnd(
  t: TestApp,
  p: Awaited<ReturnType<typeof startPlayer>>,
  each?: (step: number) => void | Promise<void>,
) {
  p.client.ready();
  await waitFor(() => p.client.startAt !== null, 'run.go');
  t.clock.set(p.client.startAt!);
  for (let step = 0; !p.client.result; step++) {
    if (step > 2000) throw new Error('Run tidak selesai');
    t.clock.advance(100);
    await each?.(step);
    p.client.advanceTo(p.client.targetTick(t.clock.now()));
    p.client.watermark();
    await tick();
    await tick();
  }
  await waitFor(() => p.client.verified.length === p.client.result!.nearMisses, 'nearMiss.verified');
}
