// Load test penonton (BACKEND_PLAN I): banyak penonton masuk satu room dan spam gangguan.
//   pnpm --filter @racing-gang/backend spectators -- --url http://localhost:8080 --room ABC234 --count 50 --duration 60
// Jalankan sambil bot memainkan run di room yang sama, lalu pastikan bot tetap VERIFIED.
import { parseArgs } from 'node:util';
import WebSocket from 'ws';
import type { WatchC2S, WatchS2C } from '@racing-gang/config/protocol';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:8080' },
    room: { type: 'string' },
    count: { type: 'string', default: '50' },
    duration: { type: 'string', default: '60' },
    rate: { type: 'string', default: '3' },
  },
});
if (!args.room) {
  console.error('Wajib --room <KODE>');
  process.exit(1);
}

const count = Number(args.count);
const stats = { connected: 0, closed: 0, errors: {} as Record<string, number>, accepted: 0, rejected: {} as Record<string, number>, scheduled: 0 };
const bump = (o: Record<string, number>, k: string) => { o[k] = (o[k] ?? 0) + 1; };
const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]!;

const randomDisrupt = (): WatchC2S => {
  const kind = pick(['NITRO', 'SPIKES', 'RED'] as const);
  if (kind === 'NITRO') return { t: 'disrupt', kind };
  if (kind === 'SPIKES') return { t: 'disrupt', kind, lane: pick([0, 1, 2, 3]) };
  return { t: 'disrupt', kind, lane: pick([0, 1, 2, 3]), durationIndex: pick([0, 1, 2] as const) };
};

const sockets: WebSocket[] = [];
for (let i = 0; i < count; i++) {
  const ws = new WebSocket(`${args.url!.replace(/^http/, 'ws')}/ws/watch?room=${args.room}&nick=load${i}`);
  ws.on('open', () => stats.connected++);
  ws.on('close', () => stats.closed++);
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString()) as WatchS2C;
    if (m.t === 'disrupt.accepted') stats.accepted++;
    else if (m.t === 'disrupt.rejected') bump(stats.rejected, m.reason);
    else if (m.t === 'disruption.scheduled' && i === 0) stats.scheduled++;
    else if (m.t === 'error') bump(stats.errors, m.code);
  });
  sockets.push(ws);
}

const interval = 1000 / Number(args.rate);
const timers = sockets.map((ws) => setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(randomDisrupt())); }, interval));
const report = setInterval(() => console.log(JSON.stringify(stats)), 5000);

setTimeout(() => {
  timers.forEach(clearInterval);
  clearInterval(report);
  sockets.forEach((ws) => ws.close());
  console.log('Selesai:', JSON.stringify(stats, null, 2));
  setTimeout(() => process.exit(0), 500);
}, Number(args.duration) * 1000);
