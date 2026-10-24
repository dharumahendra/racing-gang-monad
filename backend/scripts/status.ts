// Cek kesiapan sebelum demo (TASKS §7, BACKEND_PLAN M):
//   pnpm --filter @racing-gang/backend status -- --url https://api.contoh.com
// Menampilkan /health dan /config; kalau backend/.env berisi RPC dan kunci, juga saldo MON attester dan voucher signer.
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createPublicClient, formatEther, http, parseEther, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { ConfigResponse } from '@racing-gang/config/protocol';

if (existsSync('.env')) process.loadEnvFile('.env');
const { values: args } = parseArgs({ options: { url: { type: 'string', default: `http://localhost:${process.env.PORT ?? 8080}` } } });

const MIN_BALANCE = parseEther('1');
let problems = 0;
const warn = (msg: string) => { problems++; console.log(`  ⚠ ${msg}`); };

console.log(`Backend ${args.url}`);
try {
  const health = (await (await fetch(`${args.url}/health`)).json()) as { chainMode: string; relayerQueue: number };
  const config = (await (await fetch(`${args.url}/config`)).json()) as ConfigResponse;
  console.log(`  health      ${JSON.stringify(health)}`);
  console.log(`  chainId     ${config.chainId} · configVersion ${config.configVersion}`);
  console.log(`  kontrak     ${config.contracts ? `RunRegistry ${config.contracts.runRegistry} · CarNFT ${config.contracts.carNFT}` : 'belum di-deploy'}`);
  if (health.chainMode !== 'live') warn(`chainMode = ${health.chainMode} (bukan live; feed on-chain palsu)`);
  if (health.relayerQueue > 60) warn(`antrean relayer ${health.relayerQueue} (relayer tertinggal?)`);
  if (!config.contracts) warn('alamat kontrak belum ada di /config');
} catch (e) {
  warn(`backend tidak bisa diakses: ${(e as Error).message}`);
}

const rpc = process.env.MONAD_RPC_URL;
if (rpc) {
  const client = createPublicClient({ transport: http(rpc) });
  console.log(`\nRPC ${rpc}`);
  try {
    console.log(`  blok terbaru ${await client.getBlockNumber()}`);
    for (const [label, key] of [['attester', process.env.ATTESTER_PRIVATE_KEY], ['voucher signer', process.env.VOUCHER_SIGNER_PRIVATE_KEY]] as const) {
      if (!key) { warn(`${label}: private key tidak ada di .env`); continue; }
      const address = privateKeyToAccount(key as Hex).address;
      const balance = await client.getBalance({ address });
      console.log(`  ${label.padEnd(14)} ${address} · ${formatEther(balance)} MON`);
      if (label === 'attester' && balance < MIN_BALANCE) warn(`saldo attester < ${formatEther(MIN_BALANCE)} MON; isi dari faucet`);
    }
  } catch (e) {
    warn(`RPC gagal: ${(e as Error).message}`);
  }
} else {
  console.log('\n(MONAD_RPC_URL tidak diisi; saldo wallet tidak dicek)');
}

console.log(problems ? `\n${problems} hal perlu dicek.` : '\nSemua siap.');
process.exitCode = problems ? 1 : 0; // bukan process.exit(): di Windows bisa crash saat koneksi fetch masih ditutup
