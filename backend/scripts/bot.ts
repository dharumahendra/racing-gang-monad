// Bot pemain untuk uji end-to-end lewat jaringan sungguhan (BACKEND_PLAN G6).
//
//   pnpm --filter @racing-gang/backend bot -- --url http://localhost:8080
//   ... --parallel 5            beberapa bot sekaligus (uji beban relayer)
//   ... --speedhack             watermark palsu, harus berakhir INVALID
//   ... --disconnect 5          putus 5 dtk di tick 600 lalu sambung ulang, harus tetap VERIFIED
//   ... --key 0x...             private key wallet bot (default: kunci acak deterministik per indeks)
//
// Hanya untuk testing. Jangan dipakai untuk meluluskan akun presenter.
import { parseArgs } from 'node:util';
import { keccak256, toHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import WebSocket from 'ws';
import type { CreateRunResponse, PlayC2S, PlayS2C } from '@racing-gang/config/protocol';
import { PlayerClient } from './lib/playerClient';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:8080' },
    origin: { type: 'string', default: 'http://localhost:5173' },
    key: { type: 'string' },
    tier: { type: 'string', default: '0' },
    parallel: { type: 'string', default: '1' },
    speedhack: { type: 'boolean', default: false },
    disconnect: { type: 'string' },
  },
});

const api = async <T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> => {
  const res = await fetch(`${args.url}${path}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(json)}`);
  return json as T;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runBot(i: number) {
  const tag = `[bot ${i}]`;
  const key = (args.key && i === 0 ? args.key : keccak256(toHex(`racing-gang-bot-${args.key ?? ''}-${i}`))) as Hex;
  const account = privateKeyToAccount(key);
  const carTier = Number(args.tier);

  // Login SIWE
  const { chainId } = await api<{ chainId: number }>('/config');
  const { nonce } = await api<{ nonce: string }>('/auth/nonce', { method: 'POST', body: { address: account.address } });
  const origin = new URL(args.origin!);
  const message = createSiweMessage({ address: account.address, chainId, domain: origin.host, nonce, uri: origin.origin, version: '1', issuedAt: new Date() });
  const { token } = await api<{ token: string }>('/auth/verify', { method: 'POST', body: { message, signature: await account.signMessage({ message }) } });
  const run = await api<CreateRunResponse>('/runs', { method: 'POST', body: { carTier }, token });
  console.log(`${tag} ${account.address} run ${run.runId.slice(0, 10)}… seed ${run.seed.slice(0, 10)}…`);

  // Transport dengan buffer saat putus (TECH_SPEC §4.1 "Saat koneksi putus")
  const wsUrl = `${args.url!.replace(/^http/, 'ws')}/ws/play?token=${token}`;
  let ws: WebSocket | null = null;
  const buffer: PlayC2S[] = [];
  const send = (m: PlayC2S) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    else buffer.push(m);
  };
  const client = new PlayerClient({ runId: run.runId, seed: run.seed, carTier, send });
  let offset = 0;
  const pongs: number[] = [];
  const open = () => new Promise<void>((resolve, reject) => {
    ws = new WebSocket(wsUrl);
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as PlayS2C;
      if (m.t === 'pong') {
        const rtt = Date.now() - m.clientMs;
        pongs.push(m.serverMs - (m.clientMs + rtt / 2));
      } else client.handle(m);
    });
    ws.on('open', () => {
      const pending = buffer.splice(0);
      for (const m of pending) ws!.send(JSON.stringify(m));
      if (pending.length) console.log(`${tag} tersambung, ${pending.length} pesan dari buffer dikirim ulang`);
      resolve();
    });
    ws.on('error', reject);
  });
  await open();

  // Sinkronisasi jam: median offset dari 5 ping
  for (let k = 0; k < 5; k++) { ws!.send(JSON.stringify({ t: 'ping', clientMs: Date.now() })); await sleep(50); }
  await sleep(200);
  offset = pongs.sort((a, b) => a - b)[Math.floor(pongs.length / 2)] ?? 0;
  const serverNow = () => Date.now() + offset;

  client.ready();
  while (client.startAt === null) await sleep(10);

  let lastWm = 0;
  let disconnected = false;
  const disconnectSec = args.disconnect ? Number(args.disconnect) : 0;
  while (!client.result) {
    client.advanceTo(client.targetTick(serverNow()));
    if (Date.now() - lastWm >= 100) {
      lastWm = Date.now();
      client.watermark(args.speedhack ? client.sim.tick + 100 : client.sim.tick);
      client.snapshot();
    }
    if (disconnectSec && !disconnected && client.sim.tick >= 600) {
      disconnected = true;
      console.log(`${tag} putus ${disconnectSec} dtk di tick ${client.sim.tick}`);
      ws!.terminate();
      setTimeout(() => void open(), disconnectSec * 1000);
    }
    await sleep(10);
  }

  await sleep(3000); // beri waktu relayer mencatat mepet terakhir
  ws!.close();

  const local = client.localNearMisses.map((e) => `${e.index}:${e.tick}:${e.vehicleType}`);
  const server = client.verified.map((v) => `${v.index}:${v.tick}:${v.vehicleType}`);
  const match = JSON.stringify(local) === JSON.stringify(server);
  const lat = client.recorded.map((r) => r.latencyMs).sort((a, b) => a - b);
  const median = lat.length ? lat[Math.floor(lat.length / 2)] : null;
  console.log(
    `${tag} ${client.result.status} ${client.result.reason} @${client.result.endTick} · mepet lokal ${local.length}, backend ${server.length} · ` +
      `${match ? 'COCOK' : 'TIDAK COCOK'} · on-chain ${client.recorded.length} (median ${median ?? '-'} ms)` +
      (client.qualified.length ? ` · lulus tier ${client.qualified.map((q) => q.tier).join(',')}` : ''),
  );
  const expected = args.speedhack ? client.result.status === 'INVALID' : client.result.status === 'VERIFIED' && match;
  return expected;
}

const n = Number(args.parallel);
const results = await Promise.all(Array.from({ length: n }, (_, i) => runBot(i).catch((e) => { console.error(`[bot ${i}]`, e.message); return false; })));
const ok = results.filter(Boolean).length;
console.log(`${ok}/${n} bot PASS`);
process.exit(ok === n ? 0 : 1);
