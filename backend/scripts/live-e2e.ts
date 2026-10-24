// Uji ujung ke ujung CHAIN_MODE=live terhadap RunRegistry dan CarNFT sungguhan di anvil lokal.
//   pnpm --filter @racing-gang/backend live-e2e -- --players 3 --kill-after 15
// Butuh `anvil` di PATH dan artifact `forge build` di contract/out.
//
// 1. Run normal: bot bermain lewat server, relayer mencatat, indexer mengkredit koin. Hasil on-chain
//    (getRun) harus sama dengan DB backend.
// 2. Pembelian: pemain yang lulus Tier 1 meminta voucher, membeli lewat CarNFT.buy(), lalu /me
//    menampilkan mobilnya dan koin terpotong sekali.
// 3. Crash: server dibunuh paksa di tengah run lalu start ulang. Recovery mengirim ulang RunStart dan
//    mepet yang mungkin sudah tercatat; kontrak harus tetap konsisten tanpa RECORD_FAILED.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import Database from 'better-sqlite3';
import { CARS } from '@racing-gang/config';
import type { Address, Hex, MeResponse, VoucherResponse } from '@racing-gang/config/protocol';
import { createPublicClient, createWalletClient, defineChain, http, parseEther, type Abi, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';
import { carNftAbi, runRegistryAbi } from '../src/chain/abi';
import { runScript, startServer, type ServerProc } from './lib/server';

const { values: args } = parseArgs({
  options: {
    players: { type: 'string', default: '3' },
    'kill-after': { type: 'string', default: '15' },
    port: { type: 'string', default: '18082' },
    'anvil-port': { type: 'string', default: '18545' },
  },
});

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../contract/out');
const artifact = (name: string) => JSON.parse(readFileSync(resolve(OUT, `${name}.sol/${name}.json`), 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
if (spawnSync('anvil', ['--version']).status !== 0 || !existsSync(resolve(OUT, 'RunRegistry.sol/RunRegistry.json'))) {
  console.error('butuh anvil di PATH dan `forge build` di contract/');
  process.exit(1);
}

// Akun bawaan anvil (kunci publik, hanya untuk lokal).
const KEYS = {
  deployer: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  attester: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  voucher: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  player: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
} as const satisfies Record<string, Hex>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push([name, ok, detail]);
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` (${detail})` : ''}`);
};

// ── anvil + deploy ───────────────────────────────────────────────────────
const rpc = `http://127.0.0.1:${args['anvil-port']}`;
const chain = defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const anvil = spawn('anvil', ['--port', args['anvil-port']!, '--block-time', '1', '--silent'], { stdio: 'ignore' });
const pub = createPublicClient({ chain, transport: http(rpc), pollingInterval: 100 }) as PublicClient;
const deployer = createWalletClient({ chain, transport: http(rpc), account: privateKeyToAccount(KEYS.deployer) });
const playerWallet = createWalletClient({ chain, transport: http(rpc), account: privateKeyToAccount(KEYS.player) });
const player = playerWallet.account.address;
for (let i = 0; ; i++) {
  try { await pub.getChainId(); break; } catch { if (i > 100) throw new Error('anvil tidak siap'); await sleep(100); }
}
const deploy = async (name: string, ctorArgs: unknown[]): Promise<Address> => {
  const a = artifact(name);
  const hash = await deployer.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args: ctorArgs });
  return (await pub.waitForTransactionReceipt({ hash })).contractAddress!;
};
const registry = await deploy('RunRegistry', [privateKeyToAccount(KEYS.attester).address, CARS.map((c) => c.reqNearMiss), CARS.map((c) => c.minCarTier)]);
const carNFT = await deploy('CarNFT', [registry, privateKeyToAccount(KEYS.voucher).address, CARS.map((c) => parseEther(c.priceMon)), CARS.map((c) => BigInt(c.supply)), '']);
await pub.waitForTransactionReceipt({ hash: await deployer.writeContract({ address: registry, abi: artifact('RunRegistry').abi, functionName: 'setCarNFT', args: [carNFT] }) });
console.log(`anvil ${rpc}: RunRegistry ${registry}, CarNFT ${carNFT}`);

// ── server live ──────────────────────────────────────────────────────────
const dir = mkdtempSync(join(tmpdir(), 'rg-live-'));
const dbPath = join(dir, 'live.db');
const serverEnv = {
  CHAIN_MODE: 'live',
  CHAIN_ID: '31337',
  MONAD_RPC_URL: rpc,
  MONAD_WS_URL: rpc.replace(/^http/, 'ws'),
  ATTESTER_PRIVATE_KEY: KEYS.attester,
  VOUCHER_SIGNER_PRIVATE_KEY: KEYS.voucher,
  RUN_REGISTRY_ADDRESS: registry,
  CAR_NFT_ADDRESS: carNFT,
};
const start = () => startServer({ port: Number(args.port), dbPath, env: serverEnv });
let server: ServerProc = await start();

const getJson = async <T>(path: string, token?: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
  const res = await fetch(`${server.url}${path}`, {
    method: init.method ?? 'GET',
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
};
const health = () => getJson<{ activeRuns: number; relayerQueue: number; chainMode: string }>('/health');

const playBots = async (extra: string[]) => {
  const bots = runScript('scripts/bot.ts', ['--url', server.url, '--parallel', args.players!, ...extra], '  [bot]');
  return bots;
};

type RunRow = { id: string; near_misses: number; chain_status: string; lifecycle: string };
/** Tunggu sampai semua run selesai dicatat (tidak ada PENDING dan antrean relayer kosong). */
async function settle(label: string, timeoutMs = 90_000) {
  const t0 = Date.now();
  for (;;) {
    const db = new Database(dbPath, { readonly: true });
    const pending = (db.prepare(`SELECT count(*) n FROM runs WHERE chain_status = 'PENDING' OR lifecycle != 'ENDED'`).get() as { n: number }).n;
    db.close();
    const h = await health();
    if (pending === 0 && h.relayerQueue === 0) return console.log(`${label}: tercatat semua dalam ${((Date.now() - t0) / 1000).toFixed(1)} dtk`);
    if (Date.now() - t0 > timeoutMs) return check(`${label}: tercatat dalam ${timeoutMs / 1000} dtk`, false, `${pending} run PENDING, antrean ${h.relayerQueue}`);
    await sleep(500);
  }
}

/** Bandingkan setiap run di DB dengan getRun di kontrak, plus ledger = koin mepet tercatat. */
async function compareWithChain(label: string) {
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare('SELECT id, near_misses, chain_status, lifecycle FROM runs').all() as RunRow[];
  let mismatch = 0;
  for (const r of rows) {
    const onChain = await pub.readContract({ address: registry, abi: runRegistryAbi, functionName: 'getRun', args: [r.id as Hex] });
    if (onChain.nearMisses !== r.near_misses || !onChain.ended || r.chain_status !== 'RECORDED') {
      mismatch++;
      console.log(`  ${r.id.slice(0, 10)}: DB ${r.near_misses} mepet ${r.chain_status}, chain ${onChain.nearMisses} ended=${onChain.ended}`);
    }
  }
  check(`${label}: ${rows.length} run, mepet di kontrak = DB, RunEnded, RECORDED`, mismatch === 0, `${mismatch} beda`);
  const unrecorded = (db.prepare('SELECT count(*) n FROM near_misses WHERE recorded_at IS NULL').get() as { n: number }).n;
  check(`${label}: semua mepet punya recorded_at`, unrecorded === 0, `${unrecorded} belum`);
  const ledger = (db.prepare(`SELECT coalesce(sum(delta),0) v FROM coin_ledger WHERE delta > 0`).get() as { v: number }).v;
  const recorded = (db.prepare('SELECT coalesce(sum(coins),0) v FROM near_misses WHERE recorded_at IS NOT NULL').get() as { v: number }).v;
  check(`${label}: kredit koin di ledger = koin mepet tercatat (tidak ganda)`, ledger === recorded, `${ledger} vs ${recorded}`);
  db.close();
}

async function login(): Promise<string> {
  const origin = new URL('http://localhost:5173');
  const { nonce } = await getJson<{ nonce: string }>('/auth/nonce', undefined, { method: 'POST', body: { address: player } });
  const message = createSiweMessage({ address: player, chainId: chain.id, domain: origin.host, nonce, uri: origin.origin, version: '1', issuedAt: new Date() });
  const { token } = await getJson<{ token: string }>('/auth/verify', undefined, { method: 'POST', body: { message, signature: await playerWallet.signMessage({ message }) } });
  return token;
}

try {
  check('/health chainMode = live', (await health()).chainMode === 'live');

  // ── 1. run normal ─────────────────────────────────────────────────────
  console.log(`\n── 1. ${args.players} bot bermain normal`);
  const normal = await playBots(['--key', KEYS.player]);
  check('bot selesai tanpa error (mepet lokal = backend)', (await normal.done) === 0);
  await settle('run normal');
  await compareWithChain('run normal');

  // ── 2. pembelian Tier 1 ───────────────────────────────────────────────
  console.log('\n── 2. pembelian Tier 1');
  const token = await login();
  let me = await getJson<MeResponse>('/me', token);
  const qualifiedOnChain = await pub.readContract({ address: registry, abi: runRegistryAbi, functionName: 'isQualified', args: [player, 1] });
  check('/me qualifiedTiers sama dengan isQualified di kontrak', me.qualifiedTiers.includes(1) === qualifiedOnChain, `chain ${qualifiedOnChain}`);
  if (!qualifiedOnChain || me.coins < CARS[1]!.coinCost) {
    console.log(`  pemain belum lulus Tier 1 / koin kurang (${me.coins}); langkah pembelian dilewati, ulangi script`);
  } else {
    const coinsBefore = me.coins;
    const v = await getJson<VoucherResponse>('/vouchers', token, { method: 'POST', body: { tier: 1 } });
    const hash = await playerWallet.writeContract({
      address: carNFT, abi: carNftAbi, functionName: 'buy',
      args: [{ ...v.voucher, nonce: BigInt(v.voucher.nonce), expiry: BigInt(v.voucher.expiry) }, v.signature],
      value: parseEther(CARS[1]!.priceMon),
    });
    check('CarNFT.buy() dengan voucher backend sukses', (await pub.waitForTransactionReceipt({ hash })).status === 'success');
    for (let i = 0; i < 50 && !me.ownedTiers.includes(1); i++) { await sleep(200); me = await getJson<MeResponse>('/me', token); }
    check('/me ownedTiers berisi 1 setelah Purchased', me.ownedTiers.includes(1));
    check('koin terpotong tepat sekali, reservasi kosong', me.coins === coinsBefore - CARS[1]!.coinCost && me.coinsReserved === 0, `${coinsBefore} → ${me.coins}, reserved ${me.coinsReserved}`);
    const again = await fetch(`${server.url}/vouchers`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ tier: 1 }) });
    check('voucher kedua untuk tier yang sudah dimiliki ditolak', again.status >= 400, String(again.status));
  }

  // ── 3. crash di tengah run ────────────────────────────────────────────
  console.log(`\n── 3. ${args.players} bot, server dibunuh paksa setelah ${args['kill-after']} dtk`);
  const crashing = await playBots([]);
  while ((await health()).activeRuns < Number(args.players)) await sleep(200);
  await sleep(Number(args['kill-after']) * 1000);
  await server.kill();
  crashing.proc.kill('SIGKILL');
  server = await start();
  await settle('setelah restart');
  await compareWithChain('setelah restart');
  const db = new Database(dbPath, { readonly: true });
  const failed = (db.prepare(`SELECT count(*) n FROM runs WHERE chain_status = 'RECORD_FAILED'`).get() as { n: number }).n;
  const partial = (db.prepare(`SELECT count(*) n FROM runs WHERE result = 'PARTIAL'`).get() as { n: number }).n;
  db.close();
  check('tidak ada RECORD_FAILED (RunStart/mepet yang dikirim ulang tidak membuat revert permanen)', failed === 0, `${failed}`);
  check('run yang terputus ditutup PARTIAL', partial >= Number(args.players), `${partial}`);
  const warn = server.logs.join('').match(/run gagal dicatat permanen/g)?.length ?? 0;
  check('log relayer tanpa "gagal dicatat permanen"', warn === 0, `${warn}`);
} finally {
  await server.stop();
  anvil.kill();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows: file DB bisa masih terkunci sebentar */ }
}

const ok = results.every(([, o]) => o);
console.log(`\n${ok ? 'LULUS' : 'GAGAL'} (${results.filter(([, o]) => o).length}/${results.length})`);
process.exitCode = ok ? 0 : 1;
