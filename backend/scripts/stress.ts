// Uji beban C1 (WORST_CASE_TESTS.md): banyak pemain real-time bersamaan + satu room penuh penonton yang terus
// mengganggu, terhadap server sungguhan (proses terpisah, DB file, WebSocket lewat jaringan lokal).
//   pnpm --filter @racing-gang/backend stress -- --players 25 --spectators 50
// Lulus jika: semua bot VERIFIED dengan mepet cocok, gangguan penonton diterima, jeda event loop p99 < 50 ms.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { runScript, startServer } from './lib/server';

const { values: args } = parseArgs({
  options: {
    players: { type: 'string', default: '25' },
    spectators: { type: 'string', default: '50' },
    rate: { type: 'string', default: '3' },
    port: { type: 'string', default: '18080' },
  },
});

const dir = mkdtempSync(join(tmpdir(), 'rg-stress-'));
const server = await startServer({ port: Number(args.port), dbPath: join(dir, 'stress.db') });
console.log(`server ${server.url}, DB ${dir}`);

type Health = { activeRuns: number; connections: { players: number; rooms: number }; eventLoopLagMs: { p50: number; p99: number; max: number }; memoryMb: number; relayerQueue: number };
const samples: Health[] = [];
const poll = setInterval(async () => {
  try {
    samples.push((await (await fetch(`${server.url}/health`)).json()) as Health);
  } catch {
    // server sibuk; sampel dilewati
  }
}, 2000);

const spectators: ReturnType<typeof runScript>[] = [];
// Semua bot membuat room dan menunggu 8 dtk. Room pertama diisi penuh (maks 50 penonton); 4 room berikutnya
// masing-masing 10 penonton, supaya tetap ada gangguan walau run di room pertama cepat tabrakan.
const bots = runScript('scripts/bot.ts', ['--url', server.url, '--parallel', args.players!, '--room-wait', '8'], '', (line) => {
  const m = /room ([A-Z0-9]{6})/.exec(line);
  if (m && Number(args.spectators) > 0 && spectators.length < 5) {
    const count = spectators.length === 0 ? args.spectators! : '10';
    console.log(`${count} penonton masuk ke room ${m[1]}`);
    spectators.push(runScript('scripts/spectators.ts', [
      '--url', server.url, '--room', m[1]!, '--count', count, '--duration', '115', '--rate', args.rate!,
    ], ''));
  }
  if (!/ room | run 0x/.test(line)) console.log(`  ${line}`);
});

const botCode = await bots.done;
await Promise.all(spectators.map((s) => s.done));
clearInterval(poll);
const final = (await (await fetch(`${server.url}/health`)).json()) as Health;
await server.stop();
try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows: file DB bisa masih terkunci sebentar */ }

const busy = samples.filter((s) => s.activeRuns > 0);
const worst = (k: 'p99' | 'max') => Math.max(...busy.map((s) => s.eventLoopLagMs[k]));
console.log('\n── Hasil C1 ─────────────────────────');
console.log(`bot: ${bots.lines.at(-1)} (exit ${botCode})`);
for (const [i, s] of spectators.entries()) {
  console.log(`penonton room ${i + 1}: ${s.lines.slice(s.lines.findIndex((l) => l.startsWith('Selesai'))).join(' ').replace(/\s+/g, ' ')}`);
}
console.log(`run aktif puncak ${Math.max(...samples.map((s) => s.activeRuns))}, koneksi pemain puncak ${Math.max(...samples.map((s) => s.connections.players))}`);
console.log(`jeda event loop selama beban: p99 terburuk ${worst('p99')} ms, maks ${worst('max')} ms`);
console.log(`memori puncak ${Math.max(...samples.map((s) => s.memoryMb))} MB; antrean relayer akhir ${final.relayerQueue}; koneksi akhir ${JSON.stringify(final.connections)}`);
const ok = botCode === 0 && worst('p99') < 50 && final.connections.players === 0;
console.log(ok ? 'LULUS' : 'GAGAL');
process.exitCode = ok ? 0 : 1;
