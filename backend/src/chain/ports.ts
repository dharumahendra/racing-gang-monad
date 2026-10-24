// Antarmuka server ↔ chain (BACKEND_PLAN F4). Disepakati dengan Bayu:
// - Bayu mengimplementasikan RelayerPort, indexer (memanggil bus.emit), dan VoucherSigner untuk mode live.
// - Semua reaksi terhadap event (ledger, DB, WS) ada di kode backend yang berlangganan ke ChainBus.
import type { Address, Hex } from '@racing-gang/config/protocol';
import type { ChainBus } from './bus';

/** TECH_SPEC §6.1 */
export type StartRec = { runId: Hex; player: Address; carTier: number; seedBlock: bigint; configVersion: number };
export type NearMissRec = { runId: Hex; index: number; tick: number; vehicleType: number; vehicleId: number; inputHash: Hex };
export type EndRec = { runId: Hex; reason: number; endTick: number; totalNearMisses: number; finalInputHash: Hex };

/** TECH_SPEC §6.2–6.3 */
export type VoucherMessage = { buyer: Address; tier: number; coinCost: number; nonce: bigint; expiry: bigint };

export interface RelayerPort {
  enqueueStart(r: StartRec): void;
  enqueueNearMiss(r: NearMissRec): void;
  enqueueEnd(r: EndRec): void;
  queueSize(): number;
}

export interface VoucherSigner {
  readonly address: Address;
  sign(v: VoucherMessage): Promise<Hex>;
}

/** Pembacaan langsung dari chain. Dipakai untuk keputusan (POST /runs, POST /vouchers), bukan tampilan. */
export interface ChainReads {
  latestBlockNumber(): Promise<bigint>;
  blockHash(blockNumber: bigint): Promise<Hex>;
  ownsTier(owner: Address, tier: number): Promise<boolean>;
  isQualified(player: Address, tier: number): Promise<boolean>;
  minted(tier: number): Promise<bigint>;
}

export type ChainEvent =
  | { type: 'RunStarted'; runId: Hex; player: Address; seed: Hex; txHash: Hex; blockNumber: bigint }
  | { type: 'NearMiss'; runId: Hex; player: Address; index: number; tick: number; vehicleType: number; txHash: Hex; blockNumber: bigint }
  | { type: 'RunEnded'; runId: Hex; txHash: Hex; blockNumber: bigint }
  | { type: 'Qualified'; player: Address; tier: number; runId: Hex; tick: number; txHash: Hex; blockNumber: bigint }
  | { type: 'Purchased'; buyer: Address; tier: number; tokenId: bigint; voucherNonce: bigint; coinCost: number; runId: Hex; txHash: Hex; blockNumber: bigint }
  | { type: 'RecordFailed'; runId: Hex; error: string };

export interface Chain {
  readonly mode: 'mock' | 'live';
  readonly chainId: number;
  readonly reads: ChainReads;
  readonly relayer: RelayerPort;
  readonly voucher: VoucherSigner;
  readonly bus: ChainBus;
  start(): Promise<void>;
  stop(): Promise<void>;
}
