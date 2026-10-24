// Cek asumsi chain sebelum integrasi (BACKEND_PLAN H), hanya membaca RPC, tanpa wallet dan tanpa deploy:
//   pnpm --filter @racing-gang/backend check-monad -- --rpc https://testnet-rpc.monad.xyz
// 1. chainId
// 2. waktu blok rata-rata
// 3. BLOCKHASH(n) di EVM == hash blok n dari RPC, untuk n = latest − 3 (seedBlock) dan blok lain dalam 256 terakhir.
//    Dicek lewat eth_call tanpa `to`: init code `PUSH8 n · BLOCKHASH · PUSH1 0 · MSTORE · PUSH1 32 · PUSH1 0 · RETURN`.
//    Kalau hasilnya berbeda, seed backend tidak akan cocok dengan kontrak → pakai SEED_SOURCE=event.
import { parseArgs } from 'node:util';
import { createPublicClient, http, toHex, type Hex } from 'viem';
import { CHAIN } from '@racing-gang/config';

const { values: args } = parseArgs({ options: { rpc: { type: 'string', default: 'https://testnet-rpc.monad.xyz' }, samples: { type: 'string', default: '8' } } });
const client = createPublicClient({ transport: http(args.rpc) });

const blockhashInitCode = (n: bigint): Hex =>
  `0x67${n.toString(16).padStart(16, '0')}4060005260206000f3`;

let failures = 0;
const report = (ok: boolean, label: string) => { if (!ok) failures++; console.log(`${ok ? '✓' : '✗'} ${label}`); };

const chainId = await client.getChainId();
report(chainId === 10143, `chainId ${chainId}${chainId === 10143 ? ' (Monad testnet)' : ' (BUKAN 10143)'}`);

const latest = await client.getBlockNumber({ cacheTime: 0 });
const [a, b] = await Promise.all([client.getBlock({ blockNumber: latest - 100n }), client.getBlock({ blockNumber: latest })]);
const blockMs = (Number(b.timestamp - a.timestamp) * 1000) / 100;
console.log(`  blok terbaru ${latest}; rata-rata ${blockMs.toFixed(0)} ms per blok (100 blok terakhir, resolusi timestamp 1 dtk)`);

const offsets = [BigInt(CHAIN.seedBlockLag), 1n, 2n, 10n, 50n, 200n, 255n].slice(0, Number(args.samples));
let matched = 0;
for (const off of offsets) {
  // Blok acuan diambil ulang tiap kali supaya n tetap dalam 256 blok terakhir dari konteks eth_call.
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const n = head - off;
  const [call, block] = await Promise.all([
    client.call({ data: blockhashInitCode(n), blockNumber: head }),
    client.getBlock({ blockNumber: n }),
  ]);
  const evm = call.data ?? '0x';
  const same = evm.toLowerCase() === block.hash.toLowerCase();
  if (same) matched++;
  console.log(`  n = head − ${off} (${n}): EVM ${evm.slice(0, 18)}… RPC ${block.hash.slice(0, 18)}… ${same ? 'sama' : 'BEDA'}`);
}
report(matched === offsets.length, `BLOCKHASH di EVM sama dengan hash blok dari RPC (${matched}/${offsets.length})`);
console.log(failures ? '\nAda asumsi yang tidak terpenuhi; lihat BACKEND_PLAN H (SEED_SOURCE=event).' : '\nAsumsi chain terpenuhi: SEED_SOURCE=local aman dipakai.');
console.log(`(${toHex(chainId)} = ${chainId})`);
process.exitCode = failures ? 1 : 0;
