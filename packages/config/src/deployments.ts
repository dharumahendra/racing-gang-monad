// Alamat dan ABI kontrak di Monad testnet. File JSON-nya ditulis oleh script deploy Bayu
// (TECH_SPEC §6.4); sebelum deploy, semua alamat masih null.
import monadTestnetJson from '../deployments/monad-testnet.json' with { type: 'json' };

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
