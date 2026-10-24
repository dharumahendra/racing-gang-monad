// Chain Monad testnet (CHAIN_MODE=live).
// Pembacaan kontrak sudah ada di sini. Relayer, indexer, dan voucher signer live adalah tugas Bayu
// (TASKS CH-1, CH-2, CH-3); sampai itu ada, start() menolak jalan supaya tidak diam-diam memakai mock.
import { createPublicClient, defineChain, http, type PublicClient } from 'viem';
import type { Address, Hex } from '@racing-gang/config/protocol';
import type { Env } from '../env';
import { ChainBus } from './bus';
import type { Chain, ChainReads, RelayerPort, VoucherSigner } from './ports';

const runRegistryAbi = [
  { type: 'function', name: 'isQualified', stateMutability: 'view', inputs: [{ name: 'player', type: 'address' }, { name: 'tier', type: 'uint8' }], outputs: [{ type: 'bool' }] },
] as const;

const carNftAbi = [
  { type: 'function', name: 'ownsTier', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'tier', type: 'uint8' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'minted', stateMutability: 'view', inputs: [{ name: 'tier', type: 'uint8' }], outputs: [{ type: 'uint256' }] },
] as const;

export function createLiveReads(client: PublicClient, runRegistry: Address, carNFT: Address): ChainReads {
  return {
    latestBlockNumber: () => client.getBlockNumber({ cacheTime: 0 }),
    blockHash: async (blockNumber) => (await client.getBlock({ blockNumber })).hash as Hex,
    ownsTier: (owner, tier) => client.readContract({ address: carNFT, abi: carNftAbi, functionName: 'ownsTier', args: [owner, tier] }),
    isQualified: (player, tier) => client.readContract({ address: runRegistry, abi: runRegistryAbi, functionName: 'isQualified', args: [player, tier] }),
    minted: (tier) => client.readContract({ address: carNFT, abi: carNftAbi, functionName: 'minted', args: [tier] }),
  };
}

const notYet = (what: string) => () => {
  throw new Error(`${what} live belum diimplementasi (lihat TASKS CH-1/CH-2/CH-3)`);
};

export function createLiveChain(env: Env): Chain {
  const chain = defineChain({
    id: env.CHAIN_ID,
    name: 'Monad Testnet',
    nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: [env.MONAD_RPC_URL!] } },
  });
  const client = createPublicClient({ chain, transport: http(env.MONAD_RPC_URL) }) as PublicClient;
  const relayer: RelayerPort = {
    enqueueStart: notYet('Relayer'),
    enqueueNearMiss: notYet('Relayer'),
    enqueueEnd: notYet('Relayer'),
    queueSize: () => 0,
  };
  const voucher: VoucherSigner = { address: '0x0000000000000000000000000000000000000000', sign: notYet('Voucher signer') };
  return {
    mode: 'live',
    chainId: env.CHAIN_ID,
    reads: createLiveReads(client, env.RUN_REGISTRY_ADDRESS as Address, env.CAR_NFT_ADDRESS as Address),
    relayer,
    voucher,
    bus: new ChainBus(),
    start: async () => notYet('Relayer dan indexer')(),
    stop: async () => {},
  };
}
