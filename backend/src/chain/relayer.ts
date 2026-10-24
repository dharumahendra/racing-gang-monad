// Relayer live (TECH_SPEC §7.1, TASKS CH-1): mengumpulkan record dari backend dan mengirim
// RunRegistry.submitBatch() dari wallet attester, paling banyak satu transaksi dalam perjalanan.
//
// - Setiap `intervalMs`: start yang siap, maks `maxBatchNearMiss` mepet (urut per run lalu index),
//   lalu end yang semua mepetnya sudah tercatat atau ikut di batch yang sama.
// - Gas limit = estimasi × 1,1 (Monad menagih gas limit, bukan gas terpakai).
// - Batch yang revert dibagi dua sampai record bermasalah terisolasi, lalu record itu
//   dikelompokkan: tunggu dan sinkron ulang dari kontrak, anggap sudah tercatat, atau gagal permanen
//   (event `RecordFailed` ke bus).
// - Status run yang belum dikenal (mis. setelah backend restart) dibaca dari `getRun`, jadi record
//   duplikat dibuang sebelum dikirim.
//
// Catatan Monad: wallet attester harus bersaldo > 10 MON. Di bawah itu (reserve balance) akun hanya
// boleh mengirim 1 transaksi per 3 blok (±1,2 dtk) dan latensi on-chain akan molor.
import { CHAIN } from '@racing-gang/config';
import type { Address, Hex } from '@racing-gang/config/protocol';
import {
  BaseError,
  ContractFunctionRevertedError,
  InvalidParamsRpcError,
  MethodNotFoundRpcError,
  MethodNotSupportedRpcError,
  zeroAddress,
  type Account,
  type Chain as ViemChain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem';
import { runRegistryAbi } from './abi';
import type { ChainBus } from './bus';
import { consoleLog, type ChainLog } from './log';
import type { EndRec, NearMissRec, RelayerPort, StartRec } from './ports';

type Rec = { kind: 'start'; r: StartRec } | { kind: 'near'; r: NearMissRec } | { kind: 'end'; r: EndRec };

/** Status run di kontrak sejauh yang diketahui relayer. */
type RunState = { started: boolean; recorded: number; ended: boolean };

type SendOutcome = { ok: true } | { ok: false; revert: string };

export type RelayerOptions = {
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, ViemChain, Account>;
  registry: Address;
  bus: ChainBus;
  intervalMs?: number;
  maxBatchNearMiss?: number;
  /** Run yang punya record di antrean tapi tidak maju selama ini dianggap gagal permanen. */
  stuckTimeoutMs?: number;
  /** Berapa kali EndRec boleh ditolak (CountMismatch/UnknownRun) sebelum dianggap gagal. */
  maxEndAttempts?: number;
  now?: () => number;
  log?: ChainLog;
};

export class Relayer implements RelayerPort {
  #o: Required<Omit<RelayerOptions, 'log'>> & { log: ChainLog };
  #starts = new Map<Hex, StartRec>();
  #nears = new Map<Hex, Map<number, NearMissRec>>();
  #ends = new Map<Hex, EndRec>();
  #state = new Map<Hex, RunState>();
  #progressAt = new Map<Hex, number>();
  #endAttempts = new Map<Hex, number>();
  #failed = new Set<Hex>();
  #timer?: ReturnType<typeof setInterval>;
  #busy = false;
  #syncSend = true;

  constructor(opts: RelayerOptions) {
    this.#o = {
      intervalMs: CHAIN.batchIntervalMs,
      maxBatchNearMiss: CHAIN.maxBatchNearMiss,
      stuckTimeoutMs: 120_000,
      maxEndAttempts: 10,
      now: Date.now,
      log: consoleLog,
      ...opts,
    };
  }

  // ------------------------------------------------------------ RelayerPort

  enqueueStart(r: StartRec): void {
    if (this.#failed.has(r.runId)) return;
    this.#starts.set(r.runId, r);
    this.#touch(r.runId, false);
  }

  enqueueNearMiss(r: NearMissRec): void {
    if (this.#failed.has(r.runId)) return;
    let m = this.#nears.get(r.runId);
    if (!m) this.#nears.set(r.runId, (m = new Map()));
    m.set(r.index, r);
    this.#touch(r.runId, false);
  }

  enqueueEnd(r: EndRec): void {
    if (this.#failed.has(r.runId)) return;
    this.#ends.set(r.runId, r);
    this.#touch(r.runId, false);
  }

  queueSize(): number {
    let n = this.#starts.size + this.#ends.size;
    for (const m of this.#nears.values()) n += m.size;
    return n;
  }

  // ------------------------------------------------------------ loop

  start(): void {
    this.#timer ??= setInterval(() => void this.tick(), this.#o.intervalMs);
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  /** Satu putaran yang aman dipanggil dari timer: tidak pernah tumpang tindih dan tidak melempar. */
  async tick(): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    try {
      await this.flush();
    } catch (err) {
      this.#o.log.warn({ err: errorMessage(err), queue: this.queueSize() }, 'relayer: putaran gagal, dicoba lagi');
    } finally {
      this.#busy = false;
    }
  }

  /** Sinkron status run yang belum dikenal, buang run yang macet, susun satu batch, lalu kirim. */
  async flush(): Promise<void> {
    await this.#syncUnknownRuns();
    await this.#failStuckRuns();
    const batch = this.#selectBatch();
    if (batch.length > 0) await this.#submit(batch);
  }

  // ------------------------------------------------------------ susun batch

  #queuedRuns(): Set<Hex> {
    return new Set<Hex>([...this.#starts.keys(), ...this.#nears.keys(), ...this.#ends.keys()]);
  }

  async #syncUnknownRuns(): Promise<void> {
    for (const runId of this.#queuedRuns()) {
      if (this.#state.has(runId) || this.#starts.has(runId)) continue;
      const run = await this.#o.publicClient.readContract({
        address: this.#o.registry,
        abi: runRegistryAbi,
        functionName: 'getRun',
        args: [runId],
      });
      // Run yang belum ada di kontrak tidak di-cache: dicek lagi di putaran berikutnya.
      if (run.player !== zeroAddress) this.#state.set(runId, { started: true, recorded: run.nearMisses, ended: run.ended });
    }
  }

  async #failStuckRuns(): Promise<void> {
    const now = this.#o.now();
    for (const runId of this.#queuedRuns()) {
      const since = this.#progressAt.get(runId) ?? now;
      if (now - since > this.#o.stuckTimeoutMs) await this.#fail(runId, 'Stuck: record tidak bisa dicatat');
    }
  }

  #selectBatch(): Rec[] {
    const recs: Rec[] = [];
    const starting = new Set<Hex>();
    for (const s of this.#starts.values()) {
      if (this.#state.get(s.runId)?.started) {
        this.#starts.delete(s.runId); // sudah tercatat
        continue;
      }
      recs.push({ kind: 'start', r: s });
      starting.add(s.runId);
    }

    const covered = new Map<Hex, number>(); // index mepet tertinggi yang tercatat atau ikut batch ini
    let nearCount = 0;
    for (const runId of [...this.#nears.keys()].sort()) {
      const m = this.#nears.get(runId)!;
      const st = this.#state.get(runId);
      if (!st?.started && !starting.has(runId)) continue;
      let next = (st?.recorded ?? 0) + 1;
      for (const idx of m.keys()) if (idx < next) m.delete(idx); // duplikat
      if (st?.ended && m.size > 0) {
        this.#o.log.warn({ runId, dropped: m.size }, 'relayer: mepet untuk run yang sudah selesai dibuang');
        m.clear();
      }
      while (nearCount < this.#o.maxBatchNearMiss && m.has(next)) {
        recs.push({ kind: 'near', r: m.get(next)! });
        next++;
        nearCount++;
      }
      covered.set(runId, next - 1);
      if (m.size === 0) this.#nears.delete(runId);
    }

    for (const e of this.#ends.values()) {
      const st = this.#state.get(e.runId);
      if (st?.ended) {
        this.#ends.delete(e.runId);
        continue;
      }
      if (!st?.started && !starting.has(e.runId)) continue;
      const done = covered.get(e.runId) ?? st?.recorded ?? 0;
      // done > total berarti data backend tidak konsisten; biarkan kontrak menolak (CountMismatch).
      if (done >= e.totalNearMisses) recs.push({ kind: 'end', r: e });
    }
    return recs;
  }

  // ------------------------------------------------------------ kirim

  async #submit(recs: Rec[]): Promise<void> {
    const outcome = await this.#send(recs);
    if (outcome.ok) return this.#applySuccess(recs);
    if (outcome.revert === 'NotAttester') throw new Error('wallet relayer bukan attester RunRegistry');
    if (recs.length > 1) {
      const mid = Math.ceil(recs.length / 2);
      await this.#submit(recs.slice(0, mid));
      await this.#submit(recs.slice(mid));
      return;
    }
    await this.#classify(recs[0]!, outcome.revert);
  }

  async #send(recs: Rec[]): Promise<SendOutcome> {
    const args = [
      recs.flatMap((x) => (x.kind === 'start' ? [x.r] : [])),
      recs.flatMap((x) => (x.kind === 'near' ? [x.r] : [])),
      recs.flatMap((x) => (x.kind === 'end' ? [x.r] : [])),
    ] as const;
    const { publicClient, walletClient, registry } = this.#o;
    const account = walletClient.account;

    let gas: bigint;
    try {
      gas = await publicClient.estimateContractGas({ address: registry, abi: runRegistryAbi, functionName: 'submitBatch', args, account });
    } catch (err) {
      const name = revertName(err);
      if (name === undefined) throw err; // RPC/jaringan: coba lagi di putaran berikutnya
      return { ok: false, revert: name };
    }

    const request = {
      address: registry,
      abi: runRegistryAbi,
      functionName: 'submitBatch',
      args,
      account,
      chain: walletClient.chain,
      gas: gas + gas / 10n,
    } as const;
    const startedAt = this.#o.now();
    const receipt = await this.#sendAndWait(request);
    if (receipt.status !== 'success') return { ok: false, revert: 'TxReverted' };
    this.#o.log.info(
      { txHash: receipt.transactionHash, block: receipt.blockNumber, records: recs.length, gas: receipt.gasUsed, ms: this.#o.now() - startedAt },
      'relayer: batch tercatat',
    );
    return { ok: true };
  }

  /** `eth_sendRawTransactionSync` kalau RPC mendukung (Monad), selain itu kirim lalu tunggu receipt. */
  async #sendAndWait(request: Parameters<WalletClient<Transport, ViemChain, Account>['writeContract']>[0]) {
    const { publicClient, walletClient } = this.#o;
    if (this.#syncSend) {
      try {
        return await walletClient.writeContractSync({ ...request, throwOnReceiptRevert: false });
      } catch (err) {
        if (!isMethodUnsupported(err)) throw err;
        this.#syncSend = false;
        this.#o.log.warn({}, 'relayer: RPC tidak mendukung eth_sendRawTransactionSync, pakai polling receipt');
      }
    }
    const hash = await walletClient.writeContract(request);
    return publicClient.waitForTransactionReceipt({ hash, pollingInterval: 100, timeout: 30_000 });
  }

  // ------------------------------------------------------------ hasil

  #applySuccess(recs: Rec[]): void {
    for (const rec of recs) {
      const runId = rec.r.runId;
      let st = this.#state.get(runId);
      if (!st) this.#state.set(runId, (st = { started: true, recorded: 0, ended: false }));
      if (rec.kind === 'start') {
        this.#starts.delete(runId);
      } else if (rec.kind === 'near') {
        st.recorded = Math.max(st.recorded, rec.r.index);
        const m = this.#nears.get(runId);
        m?.delete(rec.r.index);
        if (m?.size === 0) this.#nears.delete(runId);
      } else {
        st.ended = true;
        this.#ends.delete(runId);
      }
      this.#touch(runId, true);
    }
    this.#prune();
  }

  async #classify(rec: Rec, revert: string): Promise<void> {
    const runId = rec.r.runId;
    const resync = () => void this.#state.delete(runId); // baca ulang getRun di putaran berikutnya
    if (revert === 'TxReverted') return resync(); // alasan sebenarnya terlihat saat estimasi berikutnya

    switch (rec.kind) {
      case 'start':
        if (revert === 'RunExists') {
          this.#starts.delete(runId); // sudah tercatat, mis. retry setelah receipt hilang
          return resync();
        }
        return this.#fail(runId, revert); // SeedBlockInvalid, CarNotOwned
      case 'near':
        if (revert === 'UnknownRun' || revert === 'IndexGap') return resync();
        return this.#fail(runId, revert); // RunAlreadyEnded, RunTooOld, TickOutOfRange
      case 'end': {
        if (revert === 'RunAlreadyEnded') {
          this.#ends.delete(runId);
          return resync();
        }
        if (revert === 'UnknownRun' || revert === 'CountMismatch') {
          const attempts = (this.#endAttempts.get(runId) ?? 0) + 1;
          this.#endAttempts.set(runId, attempts);
          if (attempts < this.#o.maxEndAttempts) return resync();
        }
        return this.#fail(runId, revert);
      }
    }
  }

  async #fail(runId: Hex, error: string): Promise<void> {
    if (this.#failed.has(runId)) return;
    this.#failed.add(runId);
    this.#starts.delete(runId);
    this.#nears.delete(runId);
    this.#ends.delete(runId);
    this.#state.delete(runId);
    this.#progressAt.delete(runId);
    this.#endAttempts.delete(runId);
    this.#o.log.warn({ runId, error }, 'relayer: run gagal dicatat permanen');
    await this.#o.bus.emit({ type: 'RecordFailed', runId, error });
  }

  /** Catat waktu kemajuan run. `force` = ada record yang berhasil; tanpa force hanya mengisi yang kosong. */
  #touch(runId: Hex, force: boolean): void {
    if (force || !this.#progressAt.has(runId)) this.#progressAt.set(runId, this.#o.now());
  }

  #prune(): void {
    const queued = this.#queuedRuns();
    for (const [runId, st] of this.#state) {
      if (st.ended && !queued.has(runId)) {
        this.#state.delete(runId);
        this.#progressAt.delete(runId);
        this.#endAttempts.delete(runId);
      }
    }
    for (const runId of this.#progressAt.keys()) if (!queued.has(runId) && !this.#state.has(runId)) this.#progressAt.delete(runId);
  }
}

/** Nama custom error kontrak dari error viem, atau undefined kalau bukan revert. */
export function revertName(err: unknown): string | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(reverted instanceof ContractFunctionRevertedError)) return undefined;
  return reverted.data?.errorName ?? reverted.reason ?? 'Reverted';
}

/** RPC tidak mengenal eth_sendRawTransactionSync, atau menolak bentuk parameternya. */
function isMethodUnsupported(err: unknown): boolean {
  if (!(err instanceof BaseError)) return false;
  return !!err.walk(
    (e) => e instanceof MethodNotFoundRpcError || e instanceof MethodNotSupportedRpcError || e instanceof InvalidParamsRpcError,
  );
}

function errorMessage(err: unknown): string {
  return err instanceof BaseError ? err.shortMessage : err instanceof Error ? err.message : String(err);
}
