// Room dan penonton (PRD §7, TECH_SPEC §4.2, §5.4, BACKEND_PLAN I).
import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { WebSocket } from 'ws';
import { ROOM, SPECTATOR, disruptionCost, type DisruptionKind, type DurationIndex } from '@racing-gang/config';
import type { Address, CreateRoomResponse, DisruptRejectReason, RoomResponse, RoomRunInfo, WatchS2C, WsErrorCode } from '@racing-gang/config/protocol';
import type { Db } from '../db/client';
import { rooms } from '../db/schema';
import { send, type Hub } from '../ws/hub';
import type { RunManager } from './runs';

type Spectator = {
  id: string;
  nick: string;
  ws: WebSocket;
  /** Energi pecahan; yang dikirim ke client dibulatkan ke bawah. */
  energy: number;
  energyTs: number;
  lastSentEnergy: number;
  winStart: number;
  winCount: number;
};

export type DisruptRequest = { kind: DisruptionKind; lane?: number; durationIndex?: DurationIndex };

type Deps = { db: Db; hub: Hub; runs: RunManager; now: () => number };

export const sanitizeNick = (raw: string | undefined, fallbackId: string) => {
  const clean = (raw ?? '').replace(/[\u0000-\u001f\u007f<>"'`]/g, '').trim().slice(0, 16);
  return clean || `Penonton-${fallbackId.slice(0, 4).toUpperCase()}`;
};

export class RoomManager {
  readonly #deps: Deps;
  #spectators = new Map<string, Map<WebSocket, Spectator>>();
  #nextId = 0;

  constructor(deps: Deps) {
    this.#deps = deps;
  }

  async create(host: Address): Promise<CreateRoomResponse> {
    const { db, now } = this.#deps;
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = Array.from({ length: ROOM.codeLength }, () => ROOM.alphabet[randomInt(ROOM.alphabet.length)]).join('');
      const t = now();
      const r = db.insert(rooms).values({ code, hostAddress: host, createdAt: t, expiresAt: t + ROOM.ttlMs }).onConflictDoNothing().run();
      if (r.changes > 0) return { code, expiresAt: t + ROOM.ttlMs };
    }
    throw new Error('Gagal membuat kode room unik');
  }

  row(code: string) {
    return this.#deps.db.select().from(rooms).where(eq(rooms.code, code.toUpperCase())).get();
  }

  runInfo(code: string): RoomRunInfo | null {
    const s = this.#deps.runs.byRoom(code);
    return s ? { runId: s.runId, seed: s.seed, carTier: s.carTier, startAt: s.startAt } : null;
  }

  info(code: string): RoomResponse | null {
    const r = this.row(code);
    if (!r) return null;
    return { code: r.code, expiresAt: r.expiresAt, spectators: this.count(r.code), run: this.runInfo(r.code) };
  }

  count(code: string) {
    return this.#spectators.get(code)?.size ?? 0;
  }

  join(code: string, rawNick: string | undefined, ws: WebSocket): { ok: true; spectator: Spectator } | { ok: false; code: WsErrorCode; message: string } {
    const r = this.row(code);
    if (!r) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room tidak ditemukan' };
    const t = this.#deps.now();
    // Room kedaluwarsa masih boleh dimasuki selama run di dalamnya belum selesai.
    if (r.expiresAt < t && !this.#deps.runs.byRoom(r.code)) return { ok: false, code: 'ROOM_EXPIRED', message: 'Kode room sudah kedaluwarsa' };
    if (this.count(r.code) >= SPECTATOR.maxPerRoom) return { ok: false, code: 'ROOM_FULL', message: `Room penuh (maks ${SPECTATOR.maxPerRoom} penonton)` };

    const id = `${++this.#nextId}`;
    const spectator: Spectator = {
      id, nick: sanitizeNick(rawNick, id.padStart(4, '0')), ws,
      energy: SPECTATOR.energyMax, energyTs: t, lastSentEnergy: -1, winStart: t, winCount: 0,
    };
    const map = this.#spectators.get(r.code) ?? new Map();
    map.set(ws, spectator);
    this.#spectators.set(r.code, map);
    this.#deps.hub.joinRoom(r.code, ws);
    this.broadcastState(r.code);
    this.#sendEnergy(spectator);
    return { ok: true, spectator };
  }

  leave(code: string, ws: WebSocket) {
    const map = this.#spectators.get(code);
    if (!map?.delete(ws)) return;
    if (map.size === 0) this.#spectators.delete(code);
    this.#deps.hub.leaveRoom(code, ws);
    this.broadcastState(code);
  }

  broadcastState(code: string) {
    const r = this.row(code);
    if (!r) return;
    this.#deps.hub.toRoom(r.code, {
      t: 'room.state', code: r.code, expiresAt: r.expiresAt, spectators: this.count(r.code), run: this.runInfo(r.code),
    } satisfies WatchS2C);
  }

  /** Validasi dan jadwalkan gangguan dari penonton (TECH_SPEC §5.4). */
  disrupt(code: string, ws: WebSocket, req: DisruptRequest): { ok: true; id: string } | { ok: false; reason: DisruptRejectReason } {
    const sp = this.#spectators.get(code)?.get(ws);
    if (!sp) return { ok: false, reason: 'NO_RUN' };
    const t = this.#deps.now();

    if (t - sp.winStart >= 1000) { sp.winStart = t; sp.winCount = 0; }
    if (++sp.winCount > SPECTATOR.maxMsgPerSec) return { ok: false, reason: 'RATE' };

    const r = this.row(code);
    if (!r || r.expiresAt < t) return { ok: false, reason: 'ROOM_EXPIRED' };
    const session = this.#deps.runs.byRoom(code);
    if (!session) return { ok: false, reason: 'NO_RUN' };

    const cost = disruptionCost(req.kind, req.durationIndex ?? 0);
    if (this.#energy(sp) < cost) return { ok: false, reason: 'ENERGY' };

    const lanes = req.kind === 'NITRO' ? [] : [req.lane!];
    const res = session.scheduleSpectator({ kind: req.kind, lanes, durationIndex: req.kind === 'RED' ? req.durationIndex : undefined, nick: sp.nick });
    if (!res.ok) return { ok: false, reason: res.reason };

    sp.energy -= cost;
    this.#sendEnergy(sp);
    return { ok: true, id: res.d.id };
  }

  /** Dipanggil berkala (1 dtk): kirim energi terbaru ke penonton yang energinya berubah. */
  tickEnergy() {
    for (const map of this.#spectators.values()) for (const sp of map.values()) this.#sendEnergy(sp);
  }

  #energy(sp: Spectator): number {
    const t = this.#deps.now();
    sp.energy = Math.min(SPECTATOR.energyMax, sp.energy + ((t - sp.energyTs) * SPECTATOR.regenPerSec) / 1000);
    sp.energyTs = t;
    return sp.energy;
  }

  #sendEnergy(sp: Spectator) {
    const value = Math.floor(this.#energy(sp));
    if (value === sp.lastSentEnergy) return;
    sp.lastSentEnergy = value;
    send(sp.ws, { t: 'energy', value } satisfies WatchS2C);
  }
}
