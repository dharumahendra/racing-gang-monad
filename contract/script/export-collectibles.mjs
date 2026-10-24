// Tulis alamat, blok deploy, dan ABI hasil `forge script script/DeployCollectibles.s.sol --broadcast`
// ke packages/config/deployments. Formatnya mengikuti `getCollectiblesDeployment` di
// packages/config/src/deployments.ts. Terpisah dari monad-testnet.json (RunRegistry/CarNFT).
//
// Pakai (dari folder contract/): node script/export-collectibles.mjs <chainId> [explorerUrl]
// - chainId 10143 (Monad testnet) → ../packages/config/deployments/collectibles-monad-testnet.json
// - chain lain (mis. anvil 31337)  → out/collectibles-<chainId>.json (tidak di-commit)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MONAD_TESTNET = 10143;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const chainId = Number(process.argv[2]);
if (!Number.isInteger(chainId) || chainId <= 0) {
  console.error('Pakai: node script/export-collectibles.mjs <chainId> [explorerUrl]');
  process.exit(1);
}
const explorerUrl = process.argv[3] ?? process.env.EXPLORER_URL ?? null;

const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const broadcast = readJson(`broadcast/DeployCollectibles.s.sol/${chainId}/run-latest.json`);

const tx = broadcast.transactions.find((t) => t.transactionType === 'CREATE' && t.contractName === 'Collectibles');
if (!tx) throw new Error(`Collectibles tidak ditemukan di broadcast chain ${chainId}`);
const receipt = broadcast.receipts.find((r) => r.transactionHash === tx.hash);
if (!receipt || receipt.status !== '0x1') throw new Error('receipt deploy Collectibles tidak ada atau gagal');

const deployment = {
  chainId,
  explorerUrl,
  deployBlock: Number(BigInt(receipt.blockNumber)),
  collectibles: tx.contractAddress,
  abi: readJson('out/Collectibles.sol/Collectibles.json').abi,
};

const out =
  chainId === MONAD_TESTNET
    ? resolve(root, '../packages/config/deployments/collectibles-monad-testnet.json')
    : resolve(root, `out/collectibles-${chainId}.json`);
writeFileSync(out, JSON.stringify(deployment, null, 2) + '\n');
console.log(`Collectibles ${deployment.collectibles}`);
console.log(`deployBlock  ${deployment.deployBlock}`);
console.log(`→ ${out}`);
