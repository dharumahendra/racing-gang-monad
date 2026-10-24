// Uji C2 (WORST_CASE_TESTS.md): endpoint baca tetap cepat saat DB sudah besar.
//   pnpm --filter @racing-gang/backend bigdb -- --runs 50000
// Mengisi DB file sementara: N run selesai (1.000 pemain), 20 entri log per run + satu run dengan 10.000 entri,
// 4 mepet per run, ledger per mepet. Lalu mengukur endpoint lewat app.inject (waktu handler, tanpa jaringan).
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { getAddress, keccak256, toHex, type Hex } from 'viem';
import { buildApp } from '../src/app';
import { MockChain } from '../src/chain/mock';
import { openDb } from '../src/db/client';
import { loadEnv } from '../src/env';

const { values: args } = parseArgs({ options: { runs: { type: 'string', default: '50000' } } });
const N = Number(args.runs);
const dir = mkdtempSync(join(tmpdir(), 'rg-bigdb-'));
const dbPath = join(dir, 'big.db');
const env = loadEnv({
  NODE_ENV: 'test', JWT_SECRET: 'bigdb-secret-bigdb-secret-bigdb-secret', PUBLIC_ORIGIN: 'http://localhost:5173',
  CHAIN_ID: '10143', DATABASE_URL: dbPath, ALLOW_SIWE_LOGIN: 'true',
});
const { db, close } = openDb(dbPath);
const sqlite = (db as unknown as { $client: import('better-sqlite3').Database }).$client;

// ─── Isi data (SQL mentah supaya cepat) ───────────────────────────────────
const t0 = performance.now();
const players = Array.from({ length: 1000 }, (_, i) => getAddress(keccak256(toHex(`p${i}`)).slice(0, 42)));
const insRun = sqlite.prepare(`INSERT INTO runs (id, address, car_tier, seed, seed_block, config_version, lifecycle, result, chain_status,
  end_reason, end_tick, near_misses, verified_tick, final_hash, start_at, ended_at, created_at, flags)
  VALUES (?, ?, 0, ?, 1, 1, 'ENDED', ?, 'RECORDED', 'CRASH', ?, ?, ?, ?, ?, ?, ?, '[]')`);
const insEntry = sqlite.prepare('INSERT INTO run_entries (run_id, ord, tick, kind, data, source) VALUES (?, ?, ?, ?, 0, ?)');
const insNm = sqlite.prepare(`INSERT INTO near_misses (run_id, idx, tick, vehicle_id, vehicle_type, coins, input_hash, tx_hash, block_number, verified_at, recorded_at)
  VALUES (?, ?, ?, ?, 0, 100, ?, ?, 1, ?, ?)`);
const insLedger = sqlite.prepare('INSERT INTO coin_ledger (address, delta, ref, created_at) VALUES (?, 100, ?, ?)');
let bigRun: Hex = '0x';
const fill = sqlite.transaction((from: number, to: number) => {
  for (let i = from; i < to; i++) {
    const id = keccak256(toHex(`run-${i}`));
    const player = players[i % players.length]!;
    const t = 1_700_000_000_000 + i * 1000;
    const entries = i === 0 ? 10_000 : 20;
    if (i === 0) bigRun = id;
    const nm = i % 150; // 0–149 mepet, untuk leaderboard
    insRun.run(id, player, id, i % 20 === 0 ? 'INVALID' : 'VERIFIED', 3000, nm, 3000, id, t, t + 100_000, t);
    for (let k = 1; k <= entries; k++) insEntry.run(id, k, Math.min(3000, k), 1 + (k % 4), 'PLAYER');
    for (let k = 1; k <= 4; k++) {
      insNm.run(id, k, k * 100, k, id, id, t, t + 200);
      insLedger.run(player, `${id}:${k}`, t);
    }
  }
});
for (let i = 0; i < N; i += 5000) fill(i, Math.min(N, i + 5000));
sqlite.pragma('wal_checkpoint(TRUNCATE)');
console.log(`isi DB: ${N} run, ${(N * 20 + 10_000).toLocaleString()} entri log, ${N * 4} mepet, ${N * 4} ledger · ` +
  `${(statSync(dbPath).size / 1e6).toFixed(0)} MB · ${((performance.now() - t0) / 1000).toFixed(1)} dtk`);

// ─── Ukur endpoint ───────────────────────────────────────────────────────
const chain = new MockChain({ chainId: env.CHAIN_ID, intervalMs: 0 });
const { app } = await buildApp({ env, db, chain });
await app.ready();
const token = app.jwt.sign({ sub: players[0]! });
const auth = { authorization: `Bearer ${token}` };

const cases: [string, string, Record<string, string>?][] = [
  ['GET /leaderboard?limit=100', '/leaderboard?limit=100'],
  ['GET /me (pemain dengan 50 run, 200 baris ledger)', '/me', auth],
  [`GET /runs/:id`, `/runs/${keccak256(toHex(`run-${N - 1}`))}`],
  ['GET /runs/:id/log (10.000 entri)', `/runs/${bigRun}/log`],
  ['GET /health', '/health'],
];
const results: [string, number, number, boolean][] = [];
for (const [name, url, headers] of cases) {
  const times: number[] = [];
  for (let k = 0; k < 30; k++) {
    const s = performance.now();
    const res = await app.inject({ method: 'GET', url, headers });
    times.push(performance.now() - s);
    if (res.statusCode !== 200) throw new Error(`${name} → ${res.statusCode} ${res.body.slice(0, 200)}`);
  }
  times.sort((a, b) => a - b);
  const p50 = times[15]!;
  const p95 = times[28]!;
  results.push([name, p50, p95, p95 < 50]);
}

// Rencana query: pastikan memakai index, bukan scan tabel penuh.
const plans: [string, string][] = [
  ['leaderboard', `SELECT id FROM runs WHERE "runs"."result" IN ('VERIFIED', 'PARTIAL') ORDER BY near_misses DESC, ended_at ASC LIMIT 20`],
  ['me: bestRun', `SELECT id FROM runs WHERE address = '${players[0]}' AND result IN ('VERIFIED','PARTIAL') ORDER BY near_misses DESC, created_at LIMIT 1`],
  ['me: saldo', `SELECT sum(delta) FROM coin_ledger WHERE address = '${players[0]}'`],
  ['me: pending', `SELECT sum(n.coins) FROM near_misses n JOIN runs r ON r.id = n.run_id WHERE r.address = '${players[0]}' AND n.recorded_at IS NULL`],
  ['runs: run aktif pemain', `SELECT id FROM runs WHERE address = '${players[0]}' AND lifecycle <> 'ENDED' LIMIT 1`],
  ['runs: batas per jam', `SELECT id FROM runs WHERE address = '${players[0]}' AND created_at >= 0`],
];
await app.close();
console.log('\n── Hasil C2 ─────────────────────────');
for (const [name, p50, p95, ok] of results) console.log(`${ok ? '✓' : '✗'} ${name.padEnd(48)} p50 ${p50.toFixed(1).padStart(6)} ms · p95 ${p95.toFixed(1).padStart(6)} ms`);
console.log('\nRencana query:');
for (const [name, q] of plans) {
  const plan = (sqlite.prepare(`EXPLAIN QUERY PLAN ${q}`).all() as { detail: string }[]).map((r) => r.detail).join(' | ');
  console.log(`  ${/SCAN (runs|coin_ledger|near_misses)\b(?! USING)/.test(plan) ? '✗' : '✓'} ${name}: ${plan}`);
}
close();
try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows */ }
const ok = results.every((r) => r[3]);
console.log(ok ? 'LULUS' : 'GAGAL');
process.exitCode = ok ? 0 : 1;
