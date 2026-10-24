// Cek kesiapan sebelum demo (TASKS §7, BACKEND_PLAN M):
//   pnpm --filter @racing-gang/backend status -- --url https://api.contoh.com
// Menampilkan /health dan /config; kalau backend/.env berisi RPC, juga mencocokkan parameter kontrak on-chain dengan CARS,
// kunci di .env dengan attester/voucher signer kontrak, dan saldo MON keduanya.
//   --skip-backend  hanya cek chain (tanpa server berjalan)
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createPublicClient, formatEther, getAddress, http, parseAbi, parseEther, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CARS } from '@racing-gang/config';
import type { ConfigResponse } from '@racing-gang/config/protocol';

if (existsSync('.env')) process.loadEnvFile('.env');
const { values: args } = parseArgs({
  options: { url: { type: 'string', default: `http://localhost:${process.env.PORT ?? 8080}` }, 'skip-backend': { type: 'boolean', default: false } },
});

// Monad: saldo di bawah reserve balance (10 MON) membuat tx attester ditolak (CLAUDE.md, aturan teknis).
const MIN_BALANCE = parseEther('10');
const readAbi = parseAbi([
  'function attester() view returns (address)',
  'function owner() view returns (address)',
  'function carNFT() view returns (address)',
  'function reqNearMiss(uint8 tier) view returns (uint16)',
  'function minCarTier(uint8 tier) view returns (uint8)',
  'function registry() view returns (address)',
  'function voucherSigner() view returns (address)',
  'function price(uint8 tier) view returns (uint256)',
  'function supply(uint8 tier) view returns (uint256)',
  'function minted(uint8 tier) view returns (uint256)',
]);
let problems = 0;
const warn = (msg: string) => { problems++; console.log(`  ⚠ ${msg}`); };

if (!args['skip-backend']) {
  console.log(`Backend ${args.url}`);
  try {
    const health = (await (await fetch(`${args.url}/health`)).json()) as {
      chainMode: string;
      relayerQueue: number;
      onChainLatency: { samples: number; medianMs: number; p90Ms: number } | null;
    };
    const config = (await (await fetch(`${args.url}/config`)).json()) as ConfigResponse;
    console.log(`  health      ${JSON.stringify(health)}`);
    console.log(`  chainId     ${config.chainId} · configVersion ${config.configVersion}`);
    console.log(`  kontrak     ${config.contracts ? `RunRegistry ${config.contracts.runRegistry} · CarNFT ${config.contracts.carNFT}` : 'belum di-deploy'}`);
    if (health.chainMode !== 'live') warn(`chainMode = ${health.chainMode} (bukan live; feed on-chain palsu)`);
    if (health.relayerQueue > 60) warn(`antrean relayer ${health.relayerQueue} (relayer tertinggal?)`);
    if (!config.contracts) warn('alamat kontrak belum ada di /config');
    const lat = health.onChainLatency;
    if (lat && lat.medianMs > 2000) warn(`median latensi on-chain ${lat.medianMs} ms > 2000 ms (PRD §11)`);
  } catch (e) {
    warn(`backend tidak bisa diakses: ${(e as Error).message}`);
  }
}

const rpc = process.env.MONAD_RPC_URL;
if (rpc) {
  const client = createPublicClient({ transport: http(rpc) });
  console.log(`\nRPC ${rpc}`);
  try {
    console.log(`  blok terbaru ${await client.getBlockNumber()}`);
    const registry = process.env.RUN_REGISTRY_ADDRESS as Address | undefined;
    const carNFT = process.env.CAR_NFT_ADDRESS as Address | undefined;
    let roles: { attester: Address; voucherSigner: Address } | undefined;
    if (registry && carNFT) roles = await checkContracts(client, registry, carNFT);
    else warn('RUN_REGISTRY_ADDRESS / CAR_NFT_ADDRESS tidak ada di .env; kontrak tidak dicek');

    for (const [label, key, onChain] of [
      ['attester', process.env.ATTESTER_PRIVATE_KEY, roles?.attester],
      ['voucher signer', process.env.VOUCHER_SIGNER_PRIVATE_KEY, roles?.voucherSigner],
    ] as const) {
      if (!key) { warn(`${label}: private key tidak ada di .env`); continue; }
      const address = privateKeyToAccount(key as Hex).address;
      const balance = await client.getBalance({ address });
      console.log(`  ${label.padEnd(14)} ${address} · ${formatEther(balance)} MON`);
      if (onChain && getAddress(onChain) !== address) warn(`${label}: kunci di .env (${address}) bukan ${label} kontrak (${onChain})`);
      if (label === 'attester' && balance <= MIN_BALANCE) warn(`saldo attester ≤ ${formatEther(MIN_BALANCE)} MON (reserve balance Monad); isi dari faucet`);
    }
  } catch (e) {
    warn(`RPC gagal: ${(e as Error).message}`);
  }
} else {
  console.log('\n(MONAD_RPC_URL tidak diisi; saldo wallet tidak dicek)');
}

/** Parameter immutable kontrak harus sama dengan CARS; kalau beda, syarat/harga di game dan di chain tidak cocok. */
async function checkContracts(client: ReturnType<typeof createPublicClient>, registry: Address, carNFT: Address) {
  const read = <T>(address: Address, functionName: string, args: unknown[] = []) =>
    client.readContract({ address, abi: readAbi, functionName, args } as never) as Promise<T>;
  // Berurutan, bukan Promise.all: RPC publik Monad membatasi 15 request/detik.
  const attester = await read<Address>(registry, 'attester');
  const owner = await read<Address>(registry, 'owner');
  const linkedNft = await read<Address>(registry, 'carNFT');
  const nftRegistry = await read<Address>(carNFT, 'registry');
  const voucherSigner = await read<Address>(carNFT, 'voucherSigner');
  console.log(`  RunRegistry ${registry} · owner ${owner} · attester ${attester}`);
  console.log(`  CarNFT      ${carNFT} · voucherSigner ${voucherSigner}`);
  if (getAddress(linkedNft) !== getAddress(carNFT)) warn(`RunRegistry.carNFT = ${linkedNft}, bukan ${carNFT}`);
  if (getAddress(nftRegistry) !== getAddress(registry)) warn(`CarNFT.registry = ${nftRegistry}, bukan ${registry}`);

  for (const car of CARS) {
    const t = car.tier;
    const req = await read<number>(registry, 'reqNearMiss', [t]);
    const minTier = await read<number>(registry, 'minCarTier', [t]);
    let line = `  tier ${t}  syarat ${req} mepet dengan mobil ≥ tier ${minTier}`;
    if (req !== car.reqNearMiss || minTier !== car.minCarTier) warn(`tier ${t}: kontrak ${req}/${minTier}, CARS ${car.reqNearMiss}/${car.minCarTier}`);
    if (t > 0) {
      const price = await read<bigint>(carNFT, 'price', [t]);
      const supply = await read<bigint>(carNFT, 'supply', [t]);
      const minted = await read<bigint>(carNFT, 'minted', [t]);
      line += ` · ${formatEther(price)} MON · terjual ${minted}/${supply}`;
      if (price !== parseEther(car.priceMon) || supply !== BigInt(car.supply)) {
        warn(`tier ${t}: kontrak ${formatEther(price)} MON/${supply}, CARS ${car.priceMon} MON/${car.supply}`);
      }
    }
    console.log(line);
  }
  return { attester, voucherSigner };
}

console.log(problems ? `\n${problems} hal perlu dicek.` : '\nSemua siap.');
process.exitCode = problems ? 1 : 0; // bukan process.exit(): di Windows bisa crash saat koneksi fetch masih ditutup
