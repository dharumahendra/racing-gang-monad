// Verifikasi satu run di backend (TECH_SPEC §5.3, BACKEND_PLAN G2–G4).
// Sim backend memproses tick T hanya jika watermark ≥ T dan semua gangguan penonton dengan warnTick ≤ T sudah di-ack.
import { asc, eq } from 'drizzle-orm';
import {
  CARS,
  COUNTDOWN_MS,
  EndReason,
  EntryKind,
  NET,
  RUN_TICKS,
  TICK_RATE,
  WARN_TICKS,
  encodeRedData,
  type DisruptionKind,
  type DurationIndex,
  type EndReasonName,
  type PlayerInputKind,
  type RunLifecycle,
  type RunResultStatus,
  type VehicleType,
} from '@racing-gang/config';
import type { Address, Hex, PlayS2C } from '@racing-gang/config/protocol';
import { Sim, buildDisruption, canSchedule, type Disruption, type LogEntry, type SimEvent } from '@racing-gang/sim';
import type { Chain } from '../chain/ports';
import type { Db } from '../db/client';
import { disruptions, nearMisses, runEntries, runs } from '../db/schema';
import type { Env } from '../env';
import type { Hub } from '../ws/hub';

export type SessionDeps = {
  db: Db;
  chain: Chain;
  hub: Hub;
  now: () => number;
  env: Env;
  /** Kirim ulang room.state ke penonton saat status run di room berubah. */
  notifyRoom?: (code: string) => void;
};

export type SpecDisruption = {
  id: string;
  kind: DisruptionKind;
  lanes: number[];
  durationIndex?: DurationIndex;
  warnTick: number;
  order: number;
  nick: string;
  acked: boolean;
  applied: boolean | null;
};

// Slow-motion: tertinggal > SLOW_LAG_TICKS dari jam server terus-menerus selama SLOW_FLAG_MS → flag SLOW_CLIENT.
export const SLOW_LAG_TICKS = 90;
export const SLOW_FLAG_MS = 5000;
/** Ack `applied=false` saat watermark masih > 10 tick sebelum warnTick → flag DISRUPTION_DODGE. */
export const DODGE_MARGIN_TICKS = 10;

export type RunClaim ={ tick: number; reason: EndReasonName; nearMisses: number; inputHash: Hex };

type RunRow = typeof runs.$inferSelect;

const specEntry = (d: SpecDisruption): { kind: number; data: number } => {
  if (d.kind === 'NITRO') return { kind: EntryKind.SPEC_NITRO, data: 0 };
  if (d.kind === 'SPIKES') return { kind: EntryKind.SPEC_SPIKES, data: d.lanes[0]! };
  return { kind: EntryKind.SPEC_RED, data: encodeRedData(d.lanes[0]!, d.durationIndex ?? 0) };
};

export class RunSession {
  readonly runId: Hex;
  readonly address: Address;
  readonly carTier: number;
  readonly roomCode: string | null;
  readonly createdAt: number;

  seed: Hex;
  seedConfirmed: boolean;
  sim: Sim;
  lifecycle: RunLifecycle = 'CREATED';
  startAt: number | null = null;
  watermark = 0;
  flags: string[] = [];
  coins = 0;
  /** Pesan run.result terakhir; dikirim ulang kalau pemain tersambung lagi setelah run selesai. */
  lastResult: PlayS2C | null = null;

  #deps: SessionDeps;
  #onFinished: (s: RunSession) => void;
  #readyRequested = false;
  #lastClientSeq = 0;
  #ord = 0;
  #schedOrder = 0;
  #inputs = new Map<number, LogEntry[]>();
  #spec = new Map<number, SpecDisruption>();
  #claim?: RunClaim;
  #lagSince: number | null = null;

  constructor(deps: SessionDeps, row: RunRow, onFinished: (s: RunSession) => void) {
    this.#deps = deps;
    this.#onFinished = onFinished;
    this.runId = row.id as Hex;
    this.address = row.address as Address;
    this.carTier = row.carTier;
    this.roomCode = row.roomCode;
    this.createdAt = row.createdAt;
    this.seed = row.seed as Hex;
    this.seedConfirmed = deps.env.SEED_SOURCE === 'local';
    this.sim = new Sim({ runId: this.runId, seed: this.seed, carTier: this.carTier });
  }

  get ended() {
    return this.lifecycle === 'ENDED';
  }

  /** Perkiraan tick client menurut jam server (tick 1 di startAt + 33,3 ms). 0 selama hitung mundur. */
  estTick(): number {
    if (this.startAt === null) return 0;
    return Math.max(0, Math.floor(((this.#deps.now() - this.startAt) * TICK_RATE) / 1000));
  }

  // ─── Pesan dari pemain ────────────────────────────────────────────────────

  /**
   * Kunci halaman (param `client` di /ws/play) yang mengendalikan run ini, diikat pada `run.ready` pertama.
   * Null = belum ada pengendali, atau client lama/bot yang tidak mengirim kunci.
   */
  controller: string | null = null;

  /** Boleh mengirim pesan kendali? Setelah terikat, hanya kunci yang sama. */
  mayControl(client: string | null) {
    return this.controller === null || this.controller === client;
  }

  ready(client: string | null = null) {
    if (this.ended) return;
    if (!this.mayControl(client)) return;
    if (this.controller === null && client !== null) this.controller = client;
    if (this.lifecycle !== 'CREATED') return this.#sendGo();
    if (!this.seedConfirmed) {
      this.#readyRequested = true; // SEED_SOURCE=event: run.go menunggu event RunStarted
      return;
    }
    this.#startCountdown();
  }

  onInput(m: { tick: number; kind: PlayerInputKind; seq: number }) {
    if (this.ended || this.startAt === null) return;
    if (m.seq <= this.#lastClientSeq) return; // duplikat dari kiriman ulang
    this.#lastClientSeq = m.seq;
    if (m.tick <= this.watermark) return this.#flag('LATE_INPUT');
    if (m.tick < 1 || m.tick > RUN_TICKS) return;
    const list = this.#inputs.get(m.tick) ?? [];
    list.push({ tick: m.tick, kind: m.kind, data: 0, seq: m.seq });
    this.#inputs.set(m.tick, list);
  }

  onWatermark(tick: number) {
    if (this.ended || this.startAt === null || tick <= this.watermark) return;
    if (tick > this.estTick() + NET.maxAheadTicks) return this.finish('INVALID', 'TIMEOUT', 'SPEEDHACK');
    this.watermark = Math.min(tick, RUN_TICKS);
    this.#checkSlowMotion();
    if (this.lifecycle === 'READY') {
      this.lifecycle = 'RUNNING';
      this.#deps.db.update(runs).set({ lifecycle: 'RUNNING' }).where(eq(runs.id, this.runId)).run();
    }
    this.pump();
  }

  onAck(id: string, applied: boolean) {
    const d = [...this.#spec.values()].find((x) => x.id === id);
    if (!d || d.acked) return;
    d.acked = true;
    d.applied = applied;
    // "Terlambat" padahal watermark client masih jauh sebelum warnTick: gangguan sengaja ditolak.
    if (!applied && this.watermark + DODGE_MARGIN_TICKS < d.warnTick) this.#flag('DISRUPTION_DODGE');
    this.#deps.db.update(disruptions).set({ acked: true, applied }).where(eq(disruptions.id, id)).run();
    this.pump();
  }

  /** Klaim `run.end` dari client; dibandingkan dengan hasil backend (flag CLAIM_MISMATCH). */
  recordClaim(c: RunClaim) {
    this.#claim = c;
    if (this.ended) this.#compareClaim();
  }

  /**
   * Dipanggil saat pemain tersambung ulang: kirim ulang run.go, gangguan yang belum di-ack, status semua
   * mepet (pesan yang dikirim saat offline hilang), dan run.result kalau run sudah selesai.
   * Client menghapus duplikat berdasarkan `index`.
   */
  resendOnReconnect() {
    const { hub } = this.#deps;
    if (this.lifecycle === 'READY' || this.lifecycle === 'RUNNING') this.#sendGo();
    for (const d of [...this.#spec.values()].sort((a, b) => a.order - b.order)) {
      if (!d.acked) hub.toPlayer(this.address, this.#scheduledMsg(d));
    }
    this.#resendNearMisses();
    // Run selesai saat pemain offline: kirim hasilnya terakhir (client mengabaikan pesan lain setelah run.result).
    if (this.ended && this.lastResult) hub.toPlayer(this.address, this.lastResult);
  }

  #resendNearMisses() {
    const { hub, db } = this.#deps;
    const rows = db.select().from(nearMisses).where(eq(nearMisses.runId, this.runId)).orderBy(asc(nearMisses.idx)).all();
    for (const n of rows) {
      hub.toPlayer(this.address, { t: 'nearMiss.verified', index: n.idx, tick: n.tick, vehicleType: n.vehicleType as VehicleType, coins: n.coins } satisfies PlayS2C);
      if (n.txHash && n.blockNumber !== null && n.recordedAt !== null) {
        hub.toPlayer(this.address, {
          t: 'nearMiss.recorded', index: n.idx, txHash: n.txHash as Hex, blockNumber: n.blockNumber, latencyMs: n.recordedAt - n.verifiedAt,
        } satisfies PlayS2C);
      }
    }
  }

  /** Seed dari event RunStarted (TECH_SPEC §7.2). */
  confirmSeed(seed: Hex) {
    if (this.ended) return;
    if (seed.toLowerCase() === this.seed.toLowerCase()) {
      if (!this.seedConfirmed) {
        this.seedConfirmed = true;
        if (this.#readyRequested) this.#startCountdown();
      }
      return;
    }
    if (this.#deps.env.SEED_SOURCE === 'local' || this.lifecycle !== 'CREATED') {
      return this.finish('INVALID', 'TIMEOUT', 'SEED_MISMATCH');
    }
    // SEED_SOURCE=event: seed dari kontrak yang berlaku.
    this.seed = seed;
    this.sim = new Sim({ runId: this.runId, seed, carTier: this.carTier });
    this.seedConfirmed = true;
    this.#deps.db.update(runs).set({ seed }).where(eq(runs.id, this.runId)).run();
    if (this.#readyRequested) this.#startCountdown();
  }

  // ─── Gangguan penonton ───────────────────────────────────────────────────

  scheduleSpectator(p: { kind: DisruptionKind; lanes: number[]; durationIndex?: DurationIndex; nick: string }):
    | { ok: true; d: SpecDisruption }
    | { ok: false; reason: 'NO_RUN' | 'LIMIT' } {
    if (this.lifecycle !== 'RUNNING') return { ok: false, reason: 'NO_RUN' };
    const warnTick = Math.max(this.estTick(), this.watermark, this.sim.tick) + NET.disruptionLeadTicks;
    if (warnTick + WARN_TICKS > RUN_TICKS || this.#spec.has(warnTick)) return { ok: false, reason: 'LIMIT' };

    const pending: Disruption[] = [...this.#spec.values()]
      .filter((d) => d.warnTick > this.sim.tick && d.applied !== false)
      .map((d) => buildDisruption({ id: d.id, source: 'SPECTATOR', kind: d.kind, lanes: d.lanes, durationIndex: d.durationIndex, warnTick: d.warnTick }));
    const cand = buildDisruption({ id: 'cand', source: 'SPECTATOR', kind: p.kind, lanes: p.lanes, durationIndex: p.durationIndex, warnTick });
    if (!canSchedule([...this.sim.liveDisruptions(), ...pending], cand)) return { ok: false, reason: 'LIMIT' };

    const order = ++this.#schedOrder;
    const d: SpecDisruption = { id: `${this.runId.slice(2, 10)}-${order}`, ...p, warnTick, order, acked: false, applied: null };
    this.#spec.set(warnTick, d);
    this.#deps.db.insert(disruptions).values({
      id: d.id, runId: this.runId, source: 'SPECTATOR', kind: d.kind, lanes: JSON.stringify(d.lanes),
      durationIndex: d.durationIndex ?? null, warnTick, schedOrder: order, spectatorNick: p.nick, createdAt: this.#deps.now(),
    }).run();
    const msg = this.#scheduledMsg(d);
    this.#deps.hub.toPlayer(this.address, msg);
    this.#deps.hub.toRoom(this.roomCode, msg);
    return { ok: true, d };
  }

  // ─── Loop verifikasi ─────────────────────────────────────────────────────

  pump() {
    const { db } = this.#deps;
    const entryRows: (typeof runEntries.$inferInsert)[] = [];
    const nmRows: (typeof nearMisses.$inferInsert)[] = [];
    const nmEvents: Extract<SimEvent, { type: 'NEAR_MISS' }>[] = [];
    const startTick = this.sim.tick;
    let end: EndReasonName | null = null;

    while (!this.sim.ended && !this.ended) {
      const T = this.sim.tick + 1;
      if (T > this.watermark) break;
      const d = this.#spec.get(T);
      if (d && !d.acked) break; // tunggu ack gangguan penonton

      const entries: LogEntry[] = [];
      if (d?.applied) entries.push({ tick: T, ...specEntry(d), seq: 0 } as LogEntry);
      entries.push(...(this.#inputs.get(T) ?? []).sort((a, b) => a.seq - b.seq));
      this.#inputs.delete(T);

      const events = this.sim.step(entries);
      // Urutan simpan = urutan proses sim: SPEC dulu, lalu input (sama dengan urutan hash).
      for (const e of entries) {
        const isSpec = e.kind >= EntryKind.SPEC_NITRO;
        entryRows.push({
          runId: this.runId, ord: ++this.#ord, tick: e.tick, kind: e.kind, data: e.data,
          source: isSpec ? 'SPECTATOR' : 'PLAYER', clientSeq: isSpec ? null : e.seq, disruptionId: isSpec ? d!.id : null,
        });
      }
      for (const ev of events) {
        if (ev.type === 'NEAR_MISS') {
          nmEvents.push(ev);
          nmRows.push({
            runId: this.runId, idx: ev.index, tick: ev.tick, vehicleId: ev.vehicleId, vehicleType: ev.vehicleType,
            coins: ev.coins, inputHash: ev.inputHash, verifiedAt: this.#deps.now(),
          });
        } else if (ev.type === 'CRASH' || ev.type === 'RED_ZONE_FAIL' || ev.type === 'TIME_UP') {
          end = ev.type;
        }
      }
    }

    if (this.sim.tick !== startTick) {
      db.transaction((tx) => {
        if (entryRows.length) tx.insert(runEntries).values(entryRows).run();
        if (nmRows.length) tx.insert(nearMisses).values(nmRows).run();
        tx.update(runs).set({ verifiedTick: this.sim.tick, nearMisses: this.sim.nearMisses }).where(eq(runs.id, this.runId)).run();
      });
    }

    for (const ev of nmEvents) {
      this.coins += ev.coins;
      this.#deps.hub.toPlayer(this.address, { t: 'nearMiss.verified', index: ev.index, tick: ev.tick, vehicleType: ev.vehicleType, coins: ev.coins } satisfies PlayS2C);
      this.#deps.chain.relayer.enqueueNearMiss({
        runId: this.runId, index: ev.index, tick: ev.tick, vehicleType: ev.vehicleType, vehicleId: ev.vehicleId, inputHash: ev.inputHash,
      });
    }
    if (end) this.finish('VERIFIED', end);
  }

  /** Tutup run: simpan hasil, kirim EndRec ke relayer, kirim run.result. Idempoten. */
  finish(result: RunResultStatus, reason: EndReasonName, flag?: string) {
    if (this.ended) return;
    if (flag) this.flags.push(flag);
    this.lifecycle = 'ENDED';
    const endTick = this.sim.tick;
    const total = this.sim.nearMisses;
    const finalHash = this.sim.inputHash;
    this.#deps.db.update(runs).set({
      lifecycle: 'ENDED', result, endReason: reason, endTick, verifiedTick: endTick, nearMisses: total, finalHash,
      flags: JSON.stringify(this.flags), endedAt: this.#deps.now(),
    }).where(eq(runs.id, this.runId)).run();
    this.#deps.chain.relayer.enqueueEnd({ runId: this.runId, reason: EndReason[reason], endTick, totalNearMisses: total, finalInputHash: finalHash });

    const msg: PlayS2C = {
      t: 'run.result', status: result, reason, endTick, nearMisses: total, coins: this.coins,
      qualifiedTiers: CARS.filter((c) => c.tier > 0 && total >= c.reqNearMiss && this.carTier >= c.minCarTier).map((c) => c.tier),
    };
    this.lastResult = msg;
    this.#deps.hub.toPlayer(this.address, msg);
    this.#deps.hub.toRoom(this.roomCode, msg);
    if (this.#claim) this.#compareClaim();
    this.#onFinished(this);
    if (this.roomCode) this.#deps.notifyRoom?.(this.roomCode);
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  #startCountdown() {
    this.startAt = this.#deps.now() + COUNTDOWN_MS;
    this.lifecycle = 'READY';
    this.#deps.db.update(runs).set({ lifecycle: 'READY', startAt: this.startAt }).where(eq(runs.id, this.runId)).run();
    this.#sendGo();
    if (this.roomCode) this.#deps.notifyRoom?.(this.roomCode);
  }

  #sendGo() {
    if (this.startAt === null) return;
    const msg: PlayS2C = this.#deps.env.SEED_SOURCE === 'event'
      ? { t: 'run.go', startAt: this.startAt, seed: this.seed }
      : { t: 'run.go', startAt: this.startAt };
    this.#deps.hub.toPlayer(this.address, msg);
  }

  #scheduledMsg(d: SpecDisruption): PlayS2C {
    return {
      t: 'disruption.scheduled', id: d.id, kind: d.kind, lanes: d.lanes, warnTick: d.warnTick, by: d.nick,
      ...(d.durationIndex !== undefined ? { durationIndex: d.durationIndex } : {}),
    };
  }

  #compareClaim() {
    const c = this.#claim!;
    const mismatch = c.tick !== this.sim.tick || c.nearMisses !== this.sim.nearMisses || c.inputHash.toLowerCase() !== this.sim.inputHash.toLowerCase();
    if (mismatch && !this.flags.includes('CLAIM_MISMATCH')) {
      this.flags.push('CLAIM_MISMATCH');
      this.#deps.db.update(runs).set({ flags: JSON.stringify(this.flags) }).where(eq(runs.id, this.runId)).run();
    }
  }

  /**
   * Slow-motion: client terus online (watermark berdatangan) tapi tertinggal > 3 dtk dari jam selama > 5 dtk.
   * Putus lalu mengejar (PRD §8) hanya tertinggal sebentar, jadi tidak kena. Hanya flag, tidak membatalkan run.
   */
  #checkSlowMotion() {
    const lag = this.estTick() - this.watermark;
    if (lag <= SLOW_LAG_TICKS) {
      this.#lagSince = null;
      return;
    }
    const t = this.#deps.now();
    this.#lagSince ??= t;
    if (t - this.#lagSince >= SLOW_FLAG_MS) this.#flag('SLOW_CLIENT');
  }

  #flag(f: string) {
    if (this.flags.includes(f)) return;
    this.flags.push(f);
    this.#deps.db.update(runs).set({ flags: JSON.stringify(this.flags) }).where(eq(runs.id, this.runId)).run();
  }
}
