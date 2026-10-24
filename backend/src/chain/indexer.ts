// Indexer live (TECH_SPEC §7.2, TASKS CH-2): membaca event RunRegistry dan CarNFT, lalu meneruskannya
// ke ChainBus. Semua reaksi (ledger, DB, WS) ada di services/chainEvents.ts dan idempoten, jadi event
// yang terkirim ulang (backfill setelah restart) aman.
//
// Sumber kebenaran posisi adalah cursor blok (tabel chain_cursor): setiap putaran membaca `getLogs`
// dari cursor + 1 sampai blok terbaru. Putaran dipicu oleh blok baru dari WebSocket (eth_subscribe
// newHeads, terbit di state Proposed) kalau MONAD_WS_URL ada, plus timer cadangan. Backfill setelah
// restart memakai jalur yang sama, jadi tidak ada celah antara backfill dan langganan live.
import type { Address } from '@racing-gang/config/protocol';
import { eq } from 'drizzle-orm';
import { BaseError, parseEventLogs, type PublicClient } from 'viem';
import type { Db } from '../db/client';
import { chainCursor } from '../db/schema';
import { carNftAbi, runRegistryAbi } from './abi';
import type { ChainBus } from './bus';
import { consoleLog, type ChainLog } from './log';
import type { ChainEvent } from './ports';

export type CursorStore = {
  get(name: string): bigint | undefined;
  set(name: string, block: bigint): void;
};

export const memoryCursorStore = (): CursorStore => {
  const m = new Map<string, bigint>();
  return { get: (name) => m.get(name), set: (name, block) => void m.set(name, block) };
};

export const dbCursorStore = (db: Db): CursorStore => ({
  get: (name) => {
    const row = db.select().from(chainCursor).where(eq(chainCursor.name, name)).get();
    return row ? BigInt(row.lastBlock) : undefined;
  },
  set: (name, block) =>
    void db
      .insert(chainCursor)
      .values({ name, lastBlock: Number(block) })
      .onConflictDoUpdate({ target: chainCursor.name, set: { lastBlock: Number(block) } })
      .run(),
});

export type IndexerOptions = {
  publicClient: PublicClient;
  /** Client WebSocket untuk notifikasi blok baru. Tanpa ini indexer hanya memakai timer. */
  wsClient?: PublicClient;
  registry: Address;
  carNFT: Address;
  bus: ChainBus;
  cursor: CursorStore;
  /** Blok awal kalau cursor masih kosong (mis. blok deploy). Default: blok terbaru saat start. */
  startBlock?: bigint;
  pollMs?: number;
  /** Rentang blok awal per getLogs; dibelah dua otomatis kalau RPC menolak rentang terlalu besar. */
  maxRange?: bigint;
  log?: ChainLog;
};

const CURSOR_NAME = 'indexer';
const abi = [...runRegistryAbi, ...carNftAbi];

export class Indexer {
  #o: IndexerOptions & { log: ChainLog; maxRange: bigint };
  #from?: bigint;
  #timer?: ReturnType<typeof setInterval>;
  #unwatch?: () => void;
  #busy = false;

  constructor(opts: IndexerOptions) {
    this.#o = { maxRange: 1000n, log: consoleLog, ...opts };
  }

  async start(): Promise<void> {
    await this.#init();
    const pollMs = this.#o.pollMs ?? (this.#o.wsClient ? 1000 : 300);
    this.#timer = setInterval(() => void this.tick(), pollMs);
    this.#unwatch = this.#o.wsClient?.watchBlockNumber({
      onBlockNumber: () => void this.tick(),
      onError: (err) => this.#o.log.warn({ err: err.message }, 'indexer: langganan blok WebSocket error'),
    });
    void this.tick(); // backfill di latar belakang supaya server tidak menunggu
  }

  async stop(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#unwatch?.();
    this.#timer = undefined;
    this.#unwatch = undefined;
  }

  async tick(): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    try {
      await this.sync();
    } catch (err) {
      this.#o.log.warn({ err: err instanceof BaseError ? err.shortMessage : String(err) }, 'indexer: putaran gagal, dicoba lagi');
    } finally {
      this.#busy = false;
    }
  }

  /** Proses semua log dari cursor sampai blok terbaru, berurutan, lalu majukan cursor. */
  async sync(): Promise<void> {
    await this.#init();
    const { publicClient, registry, carNFT, bus, cursor } = this.#o;
    const latest = await publicClient.getBlockNumber({ cacheTime: 0 });
    while (this.#from! <= latest) {
      const from = this.#from!;
      const to = min(latest, from + this.#o.maxRange - 1n);
      let logs;
      try {
        logs = await publicClient.getLogs({ address: [registry, carNFT], fromBlock: from, toBlock: to });
      } catch (err) {
        if (this.#o.maxRange <= 10n) throw err;
        this.#o.maxRange /= 2n;
        continue;
      }
      for (const log of parseEventLogs({ abi, logs })) {
        const e = toChainEvent(log, registry, carNFT);
        if (e) await bus.emit(e);
      }
      cursor.set(CURSOR_NAME, to);
      this.#from = to + 1n;
    }
  }

  async #init(): Promise<void> {
    if (this.#from !== undefined) return;
    const saved = this.#o.cursor.get(CURSOR_NAME);
    this.#from = saved !== undefined ? saved + 1n : (this.#o.startBlock ?? (await this.#o.publicClient.getBlockNumber({ cacheTime: 0 })));
  }
}

type DecodedLog = ReturnType<typeof parseEventLogs<typeof abi>>[number];

export function toChainEvent(log: DecodedLog, registry: Address, carNFT: Address): ChainEvent | undefined {
  const txHash = log.transactionHash!;
  const blockNumber = log.blockNumber!;
  const from = log.address.toLowerCase();
  const isRegistry = from === registry.toLowerCase();
  const isCarNFT = from === carNFT.toLowerCase();

  switch (log.eventName) {
    case 'RunStarted':
      if (!isRegistry) return;
      return { type: 'RunStarted', runId: log.args.runId, player: log.args.player, seed: log.args.seed, txHash, blockNumber };
    case 'NearMiss':
      if (!isRegistry) return;
      return {
        type: 'NearMiss', runId: log.args.runId, player: log.args.player, index: log.args.index, tick: log.args.tick,
        vehicleType: log.args.vehicleType, txHash, blockNumber,
      };
    case 'RunEnded':
      if (!isRegistry) return;
      return { type: 'RunEnded', runId: log.args.runId, txHash, blockNumber };
    case 'Qualified':
      if (!isRegistry) return;
      return { type: 'Qualified', player: log.args.player, tier: log.args.tier, runId: log.args.runId, tick: log.args.tick, txHash, blockNumber };
    case 'Purchased':
      if (!isCarNFT) return;
      return {
        type: 'Purchased', buyer: log.args.buyer, tier: log.args.tier, tokenId: log.args.tokenId, voucherNonce: log.args.voucherNonce,
        coinCost: log.args.coinCost, runId: log.args.runId, txHash, blockNumber,
      };
    default:
      return;
  }
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);
