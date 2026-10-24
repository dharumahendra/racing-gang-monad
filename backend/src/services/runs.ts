// Pengelola run aktif (TECH_SPEC §5.2–5.3, BACKEND_PLAN G1, K).
import { randomBytes } from 'node:crypto';
import { and, asc, eq, gte, isNull, ne } from 'drizzle-orm';
import { ANTI, CARS, CHAIN, CONFIG_VERSION, EndReason, NET, RUN_TICKS, TICK_RATE } from '@racing-gang/config';
import type { Address, CreateRunResponse, Hex } from '@racing-gang/config/protocol';
import { replay } from '@racing-gang/sim';
import { computeRunId, computeSeed } from '../chain/seed';
import { nearMisses, rooms, runEntries, runs } from '../db/schema';
import { AppError, badRequest } from '../errors';
import { RunSession, type RunClaim, type SessionDeps } from './runSession';

/** Run yang dibuat tapi tidak pernah `run.ready` ditutup setelah ini. */
export const READY_TIMEOUT_MS = 60_000;
/** startAt + 100 dtk + 30 dtk (TECH_SPEC §5.3). */
export const RUN_TIMEOUT_MS = (RUN_TICKS * 1000) / TICK_RATE + NET.offlineGraceMs;
const RECENT_KEEP_MS = 120_000;

export class RunManager {
  readonly #deps: SessionDeps;
  #sessions = new Map<Hex, RunSession>();
  #byAddress = new Map<Address, RunSession>();
  /** Run yang baru selesai, untuk mencocokkan klaim run.end yang datang terlambat. */
  #recent = new Map<Hex, { s: RunSession; at: number }>();

  constructor(deps: SessionDeps) {
    this.#deps = deps;
  }

  get size() {
    return this.#sessions.size;
  }

  active(address: Address): RunSession | undefined {
    return this.#byAddress.get(address);
  }

  /** Run aktif pemain, atau run terakhirnya yang baru selesai (≤ 2 menit), untuk dikirim ulang saat reconnect. */
  latestFor(address: Address): RunSession | undefined {
    const active = this.#byAddress.get(address);
    if (active) return active;
    let latest: { s: RunSession; at: number } | undefined;
    for (const r of this.#recent.values()) if (r.s.address === address && (!latest || r.at > latest.at)) latest = r;
    return latest?.s;
  }

  get(runId: Hex): RunSession | undefined {
    return this.#sessions.get(runId) ?? this.#recent.get(runId)?.s;
  }

  /** Run aktif di room ini (maksimal satu). */
  byRoom(code: string): RunSession | undefined {
    for (const s of this.#sessions.values()) if (s.roomCode === code) return s;
    return undefined;
  }

  roomBusy(code: string) {
    return this.byRoom(code) !== undefined;
  }

  async create(address: Address, carTier: number, roomCode?: string): Promise<CreateRunResponse> {
    const { db, chain, now } = this.#deps;
    const t = now();
    if (!Number.isInteger(carTier) || !CARS[carTier]) throw badRequest('carTier tidak valid');
    if (this.#byAddress.has(address) || this.#hasOpenRunInDb(address)) {
      throw new AppError(409, 'ACTIVE_RUN_EXISTS', 'Masih ada run aktif');
    }
    const recentRuns = db.select({ id: runs.id }).from(runs).where(and(eq(runs.address, address), gte(runs.createdAt, t - 3_600_000))).all();
    if (recentRuns.length >= ANTI.maxRunsPerHour) throw new AppError(429, 'RUN_LIMIT', `Maksimal ${ANTI.maxRunsPerHour} run per jam`);
    if (roomCode !== undefined) this.#checkRoom(address, roomCode, t);
    if (carTier > 0 && !(await chain.reads.ownsTier(address, carTier).catch(chainDown))) {
      throw new AppError(403, 'CAR_NOT_OWNED', `Belum memiliki mobil tier ${carTier}`);
    }

    const latest = await chain.reads.latestBlockNumber().catch(chainDown);
    const seedBlock = latest - BigInt(CHAIN.seedBlockLag);
    const blockHash = await chain.reads.blockHash(seedBlock).catch(chainDown);
    const runId = computeRunId(address, randomBytes(8).readBigUInt64BE());
    const seed = computeSeed(blockHash, runId, address);

    const row = db.insert(runs).values({
      id: runId, address, carTier, seed, seedBlock: Number(seedBlock), roomCode: roomCode ?? null,
      configVersion: CONFIG_VERSION, lifecycle: 'CREATED', chainStatus: 'PENDING', createdAt: t,
    }).returning().get();
    chain.relayer.enqueueStart({ runId, player: address, carTier, seedBlock, configVersion: CONFIG_VERSION });

    const session = new RunSession(this.#deps, row, (s) => this.#release(s));
    this.#sessions.set(runId, session);
    this.#byAddress.set(address, session);
    if (session.roomCode) this.#deps.notifyRoom?.(session.roomCode);
    return { runId, seed, seedBlock: Number(seedBlock), configVersion: CONFIG_VERSION };
  }

  recordClaim(runId: Hex, claim: RunClaim) {
    this.get(runId)?.recordClaim(claim);
  }

  /** Dipanggil berkala (1 dtk): tutup run yang tidak pernah siap atau melewati batas waktu. */
  checkTimeouts() {
    const t = this.#deps.now();
    for (const s of [...this.#sessions.values()]) {
      if (s.lifecycle === 'CREATED' && t - s.createdAt > READY_TIMEOUT_MS) s.finish('PARTIAL', 'TIMEOUT', 'NO_READY');
      else if (s.startAt !== null && t > s.startAt + RUN_TIMEOUT_MS) s.finish('PARTIAL', 'TIMEOUT');
    }
    for (const [id, r] of this.#recent) if (t - r.at > RECENT_KEEP_MS) this.#recent.delete(id);
  }

  /**
   * Saat server start: run yang belum selesai di DB (state memori hilang) ditutup sebagai PARTIAL
   * pada tick terakhir yang terverifikasi. Hash akhir dihitung ulang dengan replay log.
   */
  recoverStaleRuns(): number {
    const { db, chain } = this.#deps;
    const stale = db.select().from(runs).where(ne(runs.lifecycle, 'ENDED')).all();
    for (const r of stale) {
      const entries = db.select().from(runEntries).where(eq(runEntries.runId, r.id)).orderBy(asc(runEntries.ord)).all();
      const rep = replay({ runId: r.id as Hex, seed: r.seed as Hex, carTier: r.carTier, entries, endTick: r.verifiedTick });
      db.update(runs).set({
        lifecycle: 'ENDED', result: 'PARTIAL', endReason: 'TIMEOUT', endTick: rep.endTick, nearMisses: rep.nearMisses, finalHash: rep.finalHash,
        endedAt: this.#deps.now(),
        flags: JSON.stringify([...JSON.parse(r.flags) as string[], 'SERVER_RESTART']),
      }).where(eq(runs.id, r.id)).run();
      // Antrean relayer di memori ikut hilang: kirim ulang mepet yang belum tercatat (duplikat dilewati kontrak).
      const unrecorded = db.select().from(nearMisses).where(and(eq(nearMisses.runId, r.id), isNull(nearMisses.recordedAt))).orderBy(asc(nearMisses.idx)).all();
      for (const n of unrecorded) {
        chain.relayer.enqueueNearMiss({ runId: r.id as Hex, index: n.idx, tick: n.tick, vehicleType: n.vehicleType, vehicleId: n.vehicleId, inputHash: n.inputHash as Hex });
      }
      chain.relayer.enqueueEnd({ runId: r.id as Hex, reason: EndReason.TIMEOUT, endTick: rep.endTick, totalNearMisses: rep.nearMisses, finalInputHash: rep.finalHash });
    }
    return stale.length;
  }

  #release(s: RunSession) {
    this.#sessions.delete(s.runId);
    if (this.#byAddress.get(s.address) === s) this.#byAddress.delete(s.address);
    this.#recent.set(s.runId, { s, at: this.#deps.now() });
  }

  #hasOpenRunInDb(address: Address) {
    return !!this.#deps.db.select({ id: runs.id }).from(runs).where(and(eq(runs.address, address), ne(runs.lifecycle, 'ENDED'))).get();
  }

  #checkRoom(address: Address, code: string, t: number) {
    const room = this.#deps.db.select().from(rooms).where(eq(rooms.code, code.toUpperCase())).get();
    if (!room) throw new AppError(404, 'ROOM_NOT_FOUND', 'Room tidak ditemukan');
    if (room.expiresAt < t) throw new AppError(409, 'ROOM_EXPIRED', 'Kode room sudah kedaluwarsa; buat room baru');
    if (room.hostAddress !== address) throw new AppError(403, 'NOT_ROOM_HOST', 'Hanya host yang bisa memulai run di room ini');
    if (this.roomBusy(room.code)) throw new AppError(409, 'ROOM_BUSY', 'Room sedang menjalankan run lain');
  }
}

function chainDown(err: unknown): never {
  throw new AppError(503, 'CHAIN_UNAVAILABLE', `Gagal membaca chain: ${(err as Error).message}`);
}
