// Uji A1 (WORST_CASE_TESTS.md): server dibunuh paksa (kill -9) di tengah beberapa run, lalu start ulang.
//   pnpm --filter @racing-gang/backend crash-test -- --players 5 --kill-after 15
// Lulus jika: DB tidak korup, semua run ditutup PARTIAL di tick terakhir yang terverifikasi, tidak ada mepet
// terverifikasi yang hilang, log tiap run lulus audit, koin = mepet yang tercatat, dan catatan yang belum
// tercatat on-chain masuk lagi ke antrean relayer.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import Database from 'better-sqlite3';
import type { Hex, RunLogResponse, RunSummaryResponse } from '@racing-gang/config/protocol';
import { auditRun } from '@racing-gang/sim';
import { runScript, startServer } from './lib/server';

const { values: args } = parseArgs({
  options: {
    players: { type: 'string', default: '5' },
    'kill-after': { type: 'string', default: '15' },
    port: { type: 'string', default: '18081' },
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'rg-crash-'));
const dbPath = join(dir, 'crash.db');
const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, detail = '') => { results.push([name, ok, detail]); };

let server = await startServer({ port: Number(args.port), dbPath });
const bots = runScript('scripts/bot.ts', ['--url', server.url, '--parallel', args.players!], '');
const health = async () => (await (await fetch(`${server.url}/health`)).json()) as { activeRuns: number; relayerQueue: number };
while ((await health()).activeRuns < Number(args.players)) await sleep(200);
console.log(`${args.players} run berjalan; server dibunuh paksa dalam ${args['kill-after']} dtk`);
await sleep(Number(args['kill-after']) * 1000);

await server.kill();
bots.proc.kill('SIGKILL');
console.log('server dibunuh (kill -9)');

// 1. DB tidak korup; catat kondisi sebelum start ulang.
type Row = { id: string; lifecycle: string; verified_tick: number; near_misses: number };
const raw = new Database(dbPath);
check('PRAGMA integrity_check', raw.pragma('integrity_check', { simple: true }) === 'ok');
const before = raw.prepare('SELECT id, lifecycle, verified_tick, near_misses FROM runs').all() as Row[];
const nmBefore = new Map((raw.prepare('SELECT run_id, count(*) n FROM near_misses GROUP BY run_id').all() as { run_id: string; n: number }[]).map((r) => [r.run_id, r.n]));
raw.close();
const open = before.filter((r) => r.lifecycle !== 'ENDED');
console.log(`sebelum start ulang: ${before.length} run, ${open.length} belum selesai, mepet tersimpan ${[...nmBefore.values()].reduce((a, b) => a + b, 0)}`);
check('ada run yang terputus di tengah', open.length > 0, `${open.length} run`);

// 2. Start ulang: recoverStaleRuns berjalan saat start.
server = await startServer({ port: Number(args.port), dbPath });
await sleep(2000); // beri waktu mock relayer memproses antrean
const db = new Database(dbPath, { readonly: true });
for (const r of open) {
  const after = db.prepare('SELECT * FROM runs WHERE id = ?').get(r.id) as Record<string, unknown>;
  const flags = JSON.parse(after.flags as string) as string[];
  const tag = r.id.slice(0, 10);
  check(`${tag} ditutup PARTIAL + SERVER_RESTART`, after.lifecycle === 'ENDED' && after.result === 'PARTIAL' && flags.includes('SERVER_RESTART'));
  check(`${tag} endTick = verified_tick sebelum mati (${r.verified_tick})`, after.end_tick === r.verified_tick);
  check(`${tag} mepet tidak hilang (${nmBefore.get(r.id) ?? 0})`, after.near_misses === (nmBefore.get(r.id) ?? 0));

  const log = (await (await fetch(`${server.url}/runs/${r.id}/log`)).json()) as RunLogResponse;
  const s = (await (await fetch(`${server.url}/runs/${r.id}`)).json()) as RunSummaryResponse;
  const audit = auditRun({ runId: log.runId, seed: log.seed, carTier: log.carTier, entries: log.entries }, {
    nearMisses: s.nearMissList.map((n) => ({ index: n.index, tick: n.tick, vehicleType: n.vehicleType, inputHash: n.inputHash })),
    end: { endTick: s.endTick!, totalNearMisses: s.nearMisses, finalInputHash: s.finalHash as Hex },
  });
  check(`${tag} audit log cocok`, audit.ok, audit.problems.join('; '));
}

// 3. Koin = mepet yang tercatat on-chain (ledger mengikuti event chain, tidak ganda).
const ledger = (db.prepare('SELECT coalesce(sum(delta),0) v FROM coin_ledger').get() as { v: number }).v;
const recorded = (db.prepare('SELECT coalesce(sum(coins),0) v FROM near_misses WHERE recorded_at IS NOT NULL').get() as { v: number }).v;
check('koin di ledger = koin mepet yang tercatat', ledger === recorded, `${ledger} vs ${recorded}`);

// 4. Catatan yang belum tercatat masuk lagi ke antrean relayer. MockChain baru tidak mengingat run sebelum mati:
//    RunStart yang dikirim ulang langsung diproses, tapi mepet dan RunEnd tertahan karena hitungannya mulai dari 0.
//    Di testnet kontrak mengingat run, jadi catatan berlanjut. Yang dicek: setiap run PENDING punya RunEnd +
//    mepet belum tercatat di antrean.
const pending = db.prepare(`SELECT r.id, (SELECT count(*) FROM near_misses n WHERE n.run_id = r.id AND n.recorded_at IS NULL) u
  FROM runs r WHERE r.chain_status = 'PENDING'`).all() as { id: string; u: number }[];
const expectedQueue = pending.reduce((a, p) => a + 1 + p.u, 0);
const queue = (await health()).relayerQueue;
check('antrean relayer berisi mepet belum tercatat + RunEnd tiap run', queue === expectedQueue, `${queue} vs ${expectedQueue}`);
db.close();

await server.stop();
try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows: file DB bisa masih terkunci sebentar */ }

console.log('\n── Hasil A1 ─────────────────────────');
for (const [name, ok, detail] of results) console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` (${detail})` : ''}`);
const ok = results.every(([, o]) => o);
console.log(ok ? 'LULUS' : 'GAGAL');
process.exitCode = ok ? 0 : 1;
