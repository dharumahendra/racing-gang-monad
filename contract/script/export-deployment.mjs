// Tulis alamat, blok deploy, dan ABI hasil `forge script script/Deploy.s.sol --broadcast`
// ke packages/config/deployments (TECH_SPEC §6.4 langkah 5). Formatnya mengikuti
// packages/config/src/deployments.ts.
//
// Pakai (dari folder contract/): node script/export-deployment.mjs <chainId> [explorerUrl]
// - chainId 10143 (Monad testnet) → ../packages/config/deployments/monad-testnet.json
// - chain lain (mis. anvil 31337)  → out/deployment-<chainId>.json (tidak di-commit)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MONAD_TESTNET = 10143;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const chainId = Number(process.argv[2]);
if (!Number.isInteger(chainId) || chainId <= 0) {
  console.error('Pakai: node script/export-deployment.mjs <chainId> [explorerUrl]');
  process.exit(1);
}
const explorerUrl = process.argv[3] ?? process.env.EXPLORER_URL ?? null;

const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const broadcast = readJson(`broadcast/Deploy.s.sol/${chainId}/run-latest.json`);

function created(name) {
  const tx = broadcast.transactions.find((t) => t.transactionType === 'CREATE' && t.contractName === name);
  if (!tx) throw new Error(`${name} tidak ditemukan di broadcast chain ${chainId}`);
  const receipt = broadcast.receipts.find((r) => r.transactionHash === tx.hash);
  if (!receipt || receipt.status !== '0x1') throw new Error(`receipt deploy ${name} tidak ada atau gagal`);
  return { address: tx.contractAddress, blockNumber: Number(BigInt(receipt.blockNumber)) };
}

const registry = created('RunRegistry');
const carNFT = created('CarNFT');

const deployment = {
  chainId,
  explorerUrl,
  deployBlock: Math.min(registry.blockNumber, carNFT.blockNumber),
  runRegistry: registry.address,
  carNFT: carNFT.address,
  abi: {
    RunRegistry: readJson('out/RunRegistry.sol/RunRegistry.json').abi,
    CarNFT: readJson('out/CarNFT.sol/CarNFT.json').abi,
  },
};

const out =
  chainId === MONAD_TESTNET
    ? resolve(root, '../packages/config/deployments/monad-testnet.json')
    : resolve(root, `out/deployment-${chainId}.json`);
writeFileSync(out, JSON.stringify(deployment, null, 2) + '\n');
console.log(`RunRegistry ${deployment.runRegistry}`);
console.log(`CarNFT      ${deployment.carNFT}`);
console.log(`deployBlock ${deployment.deployBlock}`);
console.log(`→ ${out}`);
