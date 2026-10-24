// Chain Monad testnet (CHAIN_MODE=live): pembacaan kontrak, relayer (CH-1), indexer (CH-2), dan
// voucher signer (CH-3). Juga bisa diarahkan ke anvil lokal untuk uji end-to-end.
import { getDeployment } from '@racing-gang/config';
import type { Address, Hex } from '@racing-gang/config/protocol';
import { createPublicClient, createWalletClient, defineChain, http, webSocket, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Db } from '../db/client';
import type { Env } from '../env';
import { carNftAbi, runRegistryAbi } from './abi';
import { ChainBus } from './bus';
import { dbCursorStore, Indexer, memoryCursorStore } from './indexer';
import { consoleLog, type ChainLog } from './log';
import type { Chain, ChainReads } from './ports';
import { Relayer } from './relayer';
import { createVoucherSigner } from './voucher';

export function createLiveReads(client: PublicClient, runRegistry: Address, carNFT: Address): ChainReads {
  return {
    latestBlockNumber: () => client.getBlockNumber({ cacheTime: 0 }),
    blockHash: async (blockNumber) => (await client.getBlock({ blockNumber })).hash as Hex,
    ownsTier: (owner, tier) => client.readContract({ address: carNFT, abi: carNftAbi, functionName: 'ownsTier', args: [owner, tier] }),
    isQualified: (player, tier) => client.readContract({ address: runRegistry, abi: runRegistryAbi, functionName: 'isQualified', args: [player, tier] }),
    minted: (tier) => client.readContract({ address: carNFT, abi: carNftAbi, functionName: 'minted', args: [tier] }),
  };
}

export function createLiveChain(env: Env, opts: { db?: Db; log?: ChainLog } = {}): Chain {
  const log = opts.log ?? consoleLog;
  const runRegistry = env.RUN_REGISTRY_ADDRESS as Address;
  const carNFT = env.CAR_NFT_ADDRESS as Address;
  const chain = defineChain({
    id: env.CHAIN_ID,
    name: 'Monad Testnet',
    nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: [env.MONAD_RPC_URL!], webSocket: env.MONAD_WS_URL ? [env.MONAD_WS_URL] : undefined } },
  });
  const transport = http(env.MONAD_RPC_URL);
  const publicClient = createPublicClient({ chain, transport, pollingInterval: 200 }) as PublicClient;
  const wsClient = env.MONAD_WS_URL
    ? (createPublicClient({ chain, transport: webSocket(env.MONAD_WS_URL) }) as PublicClient)
    : undefined;
  const walletClient = createWalletClient({ chain, transport, account: privateKeyToAccount(env.ATTESTER_PRIVATE_KEY as Hex) });

  const bus = new ChainBus();
  const relayer = new Relayer({ publicClient, walletClient, registry: runRegistry, bus, log });
  // Backfill mulai dari blok deploy kalau file deployments cocok dengan kontrak yang dipakai.
  const deployment = getDeployment();
  const startBlock =
    deployment && deployment.chainId === env.CHAIN_ID && deployment.runRegistry.toLowerCase() === runRegistry.toLowerCase()
      ? BigInt(deployment.deployBlock)
      : undefined;
  const indexer = new Indexer({
    publicClient,
    wsClient,
    registry: runRegistry,
    carNFT,
    bus,
    cursor: opts.db ? dbCursorStore(opts.db) : memoryCursorStore(),
    startBlock,
    log,
  });

  return {
    mode: 'live',
    chainId: env.CHAIN_ID,
    reads: createLiveReads(publicClient, runRegistry, carNFT),
    relayer,
    voucher: createVoucherSigner(env.VOUCHER_SIGNER_PRIVATE_KEY as Hex, env.CHAIN_ID, carNFT),
    bus,
    start: async () => {
      await indexer.start();
      relayer.start();
    },
    stop: async () => {
      relayer.stop();
      await indexer.stop();
    },
  };
}
