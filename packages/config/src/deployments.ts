// Alamat dan ABI kontrak di Monad testnet. File JSON-nya ditulis oleh script deploy Bayu
// (TECH_SPEC §6.4); sebelum deploy, semua alamat masih null.
import monadTestnetJson from '../deployments/monad-testnet.json' with { type: 'json' };
import collectiblesTestnetJson from '../deployments/collectibles-monad-testnet.json' with { type: 'json' };

export type Deployment = {
  chainId: number;
  explorerUrl: string | null;
  deployBlock: number;
  runRegistry: `0x${string}`;
  carNFT: `0x${string}`;
  abi: { RunRegistry: readonly unknown[]; CarNFT: readonly unknown[] };
};

type RawDeployment = {
  chainId: number | null;
  explorerUrl: string | null;
  deployBlock: number | null;
  runRegistry: string | null;
  carNFT: string | null;
  abi: { RunRegistry: readonly unknown[]; CarNFT: readonly unknown[] };
};

const isAddress = (a: string | null): a is `0x${string}` => !!a && /^0x[0-9a-fA-F]{40}$/.test(a);

/** Deployment Monad testnet, atau `null` kalau kontrak belum di-deploy. */
export function getDeployment(raw: RawDeployment = monadTestnetJson as RawDeployment): Deployment | null {
  if (raw.chainId == null || raw.deployBlock == null || !isAddress(raw.runRegistry) || !isAddress(raw.carNFT)) return null;
  return {
    chainId: raw.chainId,
    explorerUrl: raw.explorerUrl,
    deployBlock: raw.deployBlock,
    runRegistry: raw.runRegistry,
    carNFT: raw.carNFT,
    abi: raw.abi,
  };
}

// Koleksi tambahan (kontrak Collectibles, terpisah dari CarNFT). File JSON-nya ditulis oleh
// contract/script/export-collectibles.mjs; sebelum deploy, alamatnya masih null.

export type CollectiblesDeployment = {
  chainId: number;
  explorerUrl: string | null;
  deployBlock: number;
  collectibles: `0x${string}`;
  abi: readonly unknown[];
};

type RawCollectiblesDeployment = {
  chainId: number | null;
  explorerUrl: string | null;
  deployBlock: number | null;
  collectibles: string | null;
  abi: readonly unknown[];
};

/** Deployment koleksi tambahan di Monad testnet, atau `null` kalau belum di-deploy. */
export function getCollectiblesDeployment(
  raw: RawCollectiblesDeployment = collectiblesTestnetJson as RawCollectiblesDeployment,
): CollectiblesDeployment | null {
  if (raw.chainId == null || raw.deployBlock == null || !isAddress(raw.collectibles)) return null;
  return { chainId: raw.chainId, explorerUrl: raw.explorerUrl, deployBlock: raw.deployBlock, collectibles: raw.collectibles, abi: raw.abi };
}
