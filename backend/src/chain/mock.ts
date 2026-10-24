// Chain palsu untuk pengembangan dan test (CHAIN_MODE=mock). Meniru aturan RunRegistry §6.1
// (urutan index, idempoten, Qualified pada mepet ke-N) supaya alur backend bisa diuji tanpa testnet.
// Jangan dipakai saat pitch: tx hash dan nomor blok di sini palsu.
import { CARS, CHAIN } from '@racing-gang/config';
import type { Address, Hex } from '@racing-gang/config/protocol';
import { encodePacked, keccak256, zeroAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { ChainBus } from './bus';
import type { Chain, ChainReads, EndRec, NearMissRec, RelayerPort, StartRec, VoucherMessage, VoucherSigner } from './ports';
import { computeSeed } from './seed';
import { voucherDomain, voucherTypes } from './voucherTypes';

const BASE_BLOCK = 1_000_000n;
const BLOCK_MS = 400;

type MockRun = { player: Address; carTier: number; nearMisses: number; lastTick: number; ended: boolean };

export type MockChainOptions = {
  chainId: number;
  now?: () => number;
  voucherSignerKey?: Hex;
  carNFT?: Address;
  /** Interval flush relayer otomatis setelah start(); set 0 untuk flush manual di test. */
  intervalMs?: number;
};

export class MockChain implements Chain {
  readonly mode = 'mock' as const;
  readonly chainId: number;
  readonly bus = new ChainBus();
  readonly reads: ChainReads;
  readonly relayer: RelayerPort;
  readonly voucher: VoucherSigner;

  readonly runs = new Map<Hex, MockRun>();
  readonly qualified = new Map<string, Hex>(); // `${player}:${tier}` → runId
  readonly owned = new Set<string>();          // `${player}:${tier}`
  readonly mintedByTier = new Map<number, bigint>();

  #now: () => number;
  #t0: number;
  #starts: StartRec[] = [];
  #nearMisses: NearMissRec[] = [];
  #ends: EndRec[] = [];
  #timer?: ReturnType<typeof setInterval>;
  #intervalMs: number;
  #txCount = 0;

  constructor(opts: MockChainOptions) {
    this.chainId = opts.chainId;
    this.#now = opts.now ?? Date.now;
    this.#t0 = this.#now();
    this.#intervalMs = opts.intervalMs ?? CHAIN.batchIntervalMs;

    this.reads = {
      latestBlockNumber: async () => this.blockNumber(),
      blockHash: async (n) => mockBlockHash(n),
      ownsTier: async (owner, tier) => this.owned.has(`${owner}:${tier}`),
      isQualified: async (player, tier) => this.qualified.has(`${player}:${tier}`),
      minted: async (tier) => this.mintedByTier.get(tier) ?? 0n,
    };

    this.relayer = {
      enqueueStart: (r) => void this.#starts.push(r),
      enqueueNearMiss: (r) => void this.#nearMisses.push(r),
      enqueueEnd: (r) => void this.#ends.push(r),
      queueSize: () => this.#starts.length + this.#nearMisses.length + this.#ends.length,
    };

    const account = privateKeyToAccount(opts.voucherSignerKey ?? generatePrivateKey());
    const carNFT = opts.carNFT ?? zeroAddress;
    this.voucher = {
      address: account.address,
      sign: (v: VoucherMessage) =>
        account.signTypedData({ domain: voucherDomain(this.chainId, carNFT), types: voucherTypes, primaryType: 'Voucher', message: v }),
    };
  }

  blockNumber(): bigint {
    return BASE_BLOCK + BigInt(Math.floor((this.#now() - this.#t0) / BLOCK_MS));
  }

  async start() {
    if (this.#intervalMs > 0) this.#timer = setInterval(() => void this.flush(), this.#intervalMs);
  }

  async stop() {
    if (this.#timer) clearInterval(this.#timer);
  }

  /** Kirim satu "batch" seperti relayer: semua start, lalu mepet yang urut, lalu end yang lengkap. */
  async flush(): Promise<void> {
    if (this.relayer.queueSize() === 0) return;
    const blockNumber = this.blockNumber();
    const txHash = keccak256(encodePacked(['string', 'uint256'], ['mock-tx', BigInt(++this.#txCount)]));

    for (const s of this.#starts.splice(0)) {
      if (this.runs.has(s.runId)) continue;
      const seed = computeSeed(mockBlockHash(s.seedBlock), s.runId, s.player);
      this.runs.set(s.runId, { player: s.player, carTier: s.carTier, nearMisses: 0, lastTick: 0, ended: false });
      await this.bus.emit({ type: 'RunStarted', runId: s.runId, player: s.player, seed, txHash, blockNumber });
    }

    const pending = this.#nearMisses.splice(0).sort((a, b) => a.runId.localeCompare(b.runId) || a.index - b.index);
    let sent = 0;
    for (const n of pending) {
      const run = this.runs.get(n.runId);
      if (!run || run.ended || sent >= CHAIN.maxBatchNearMiss || n.index > run.nearMisses + 1) {
        this.#nearMisses.push(n); // belum bisa dicatat; coba lagi di batch berikutnya
        continue;
      }
      if (n.index <= run.nearMisses) continue; // duplikat: dilewati seperti kontrak
      run.nearMisses = n.index;
      run.lastTick = n.tick;
      sent++;
      await this.bus.emit({ type: 'NearMiss', runId: n.runId, player: run.player, index: n.index, tick: n.tick, vehicleType: n.vehicleType, txHash, blockNumber });
      for (const car of CARS) {
        const key = `${run.player}:${car.tier}`;
        if (car.tier === 0 || run.nearMisses !== car.reqNearMiss || run.carTier < car.minCarTier || this.qualified.has(key)) continue;
        this.qualified.set(key, n.runId);
        await this.bus.emit({ type: 'Qualified', player: run.player, tier: car.tier, runId: n.runId, tick: n.tick, txHash, blockNumber });
      }
    }

    for (const e of this.#ends.splice(0)) {
      const run = this.runs.get(e.runId);
      if (!run || run.nearMisses !== e.totalNearMisses) {
        this.#ends.push(e); // mepet belum semua tercatat
        continue;
      }
      if (run.ended) continue;
      run.ended = true;
      await this.bus.emit({ type: 'RunEnded', runId: e.runId, txHash, blockNumber });
    }
  }

  /** Simulasi CarNFT.buy() yang berhasil (untuk test alur voucher). */
  async simulatePurchase(buyer: Address, v: VoucherMessage): Promise<void> {
    const key = `${buyer}:${v.tier}`;
    const runId = this.qualified.get(key);
    if (!runId) throw new Error('NotQualified');
    if (this.owned.has(key)) throw new Error('AlreadyOwned');
    this.owned.add(key);
    const minted = (this.mintedByTier.get(v.tier) ?? 0n) + 1n;
    this.mintedByTier.set(v.tier, minted);
    const txHash = keccak256(encodePacked(['string', 'uint256'], ['mock-buy', BigInt(++this.#txCount)]));
    await this.bus.emit({
      type: 'Purchased', buyer, tier: v.tier, tokenId: BigInt(v.tier) * 10_000n + minted, voucherNonce: v.nonce,
      coinCost: v.coinCost, runId, txHash, blockNumber: this.blockNumber(),
    });
  }
}

export const mockBlockHash = (n: bigint): Hex => keccak256(encodePacked(['string', 'uint256'], ['mock-block', n]));
