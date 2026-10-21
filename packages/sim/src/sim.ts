// Simulasi deterministik satu run (TECH_SPEC §3.4).
// Aturan: integer saja, tanpa Math.random/Date.now, pembagian selalu Math.floor.
// Hasil hanya bergantung pada seed, carTier, CONFIG_VERSION, dan log entri.
import {
  BRAKE_DECEL,
  CARS,
  EntryKind,
  LANES,
  MIN_SPEED,
  NITRO,
  PLAYER_START_LANE,
  PLAYER_START_SPEED,
  RUN_TICKS,
  SPIKES,
  TRAFFIC,
  TRAFFIC_SPEED,
  VEHICLE,
  VehicleType,
  decodeRedData,
  isSpecEntryKind,
  laneCenter,
  type Car,
  type DisruptionKind,
  type DurationIndex,
  type EndReasonName,
} from '@racing-gang/config';
import { buildDisruption, canSchedule } from './disruptions';
import { HALF_PL, playerHits, playerInLane } from './geometry';
import { appendHash, initialHash } from './hash';
import { newTrack, updateTrack, type Track } from './nearMiss';
import { NpcScheduler } from './npc';
import { trafficRows } from './traffic';
import type { Disruption, Hex, LogEntry, Row, SimEvent, SimParams, SimView } from './types';

const isHex32 = (h: string) => /^0x[0-9a-fA-F]{64}$/.test(h);

type LiveVehicle = { id: number; lane: number; type: VehicleType; s: number; w: number; l: number; track: Track };
type LiveDisruption = { d: Disruption; phase: 'WARN' | 'ACTIVE'; hit: boolean };

const copy = (d: Disruption): Disruption => ({ ...d, lanes: [...d.lanes] });

export class Sim {
  readonly runId: Hex;
  readonly seed: Hex;
  readonly carTier: number;

  #car: Car;
  #tick = 0;
  #ended = false;
  #endReason: EndReasonName | null = null;
  #hash: Hex;

  #x = laneCenter(PLAYER_START_LANE);
  #z = 0;
  #speed: number = PLAYER_START_SPEED;
  #targetLane: number = PLAYER_START_LANE;
  #braking = false;
  #slowTicks = 0;

  #rows: Generator<Row, never>;
  #nextRow: Row;
  #vehicles: LiveVehicle[] = [];

  #npc: NpcScheduler;
  #live: LiveDisruption[] = [];

  #nearMisses = 0;
  #coins = 0;

  constructor(p: SimParams) {
    if (!isHex32(p.runId)) throw new Error('runId harus bytes32 hex');
    if (!isHex32(p.seed)) throw new Error('seed harus bytes32 hex');
    const car = CARS[p.carTier];
    if (!Number.isInteger(p.carTier) || !car) throw new Error(`carTier tidak valid: ${p.carTier}`);
    this.runId = p.runId;
    this.seed = p.seed;
    this.carTier = p.carTier;
    this.#car = car;
    this.#hash = initialHash(p.runId, p.seed);
    this.#rows = trafficRows(p.seed);
    this.#nextRow = this.#rows.next().value;
    this.#npc = new NpcScheduler(p.seed);
  }

  /** Tick terakhir yang sudah diproses (mulai 0). */
  get tick() { return this.#tick; }
  get ended() { return this.#ended; }
  get endReason() { return this.#endReason; }
  /** Hash chain setelah semua entri yang sudah diproses. */
  get inputHash() { return this.#hash; }
  get nearMisses() { return this.#nearMisses; }

  /** Gangguan yang sedang aba-aba atau aktif. Dipakai server untuk `canSchedule` sebelum menjadwalkan. */
  liveDisruptions(): Disruption[] {
    return this.#live.map((l) => copy(l.d));
  }

  /** Proses tick (this.tick + 1). `entries` = semua entri untuk tick itu, urutan bebas. */
  step(entries: LogEntry[]): SimEvent[] {
    if (this.#ended) throw new Error('Sim sudah selesai');
    const T = this.#tick + 1;
    for (const e of entries) if (e.tick !== T) throw new Error(`Entri tick ${e.tick} diberikan ke step ${T}`);
    this.#tick = T;
    const events: SimEvent[] = [];

    // 1. Entri tick T: gangguan penonton dulu (urut seq), lalu input pemain (urut seq).
    const ordered = [...entries].sort(
      (a, b) => Number(!isSpecEntryKind(a.kind)) - Number(!isSpecEntryKind(b.kind)) || a.seq - b.seq,
    );
    let specIdx = 0;
    for (const e of ordered) {
      this.#hash = appendHash(this.#hash, e);
      switch (e.kind) {
        case EntryKind.LEFT: this.#targetLane = Math.max(0, this.#targetLane - 1); break;
        case EntryKind.RIGHT: this.#targetLane = Math.min(LANES - 1, this.#targetLane + 1); break;
        case EntryKind.BRAKE_ON: this.#braking = true; break;
        case EntryKind.BRAKE_OFF: this.#braking = false; break;
        case EntryKind.SPEC_NITRO:
        case EntryKind.SPEC_SPIKES:
        case EntryKind.SPEC_RED: {
          const id = specIdx === 0 ? `s${T}` : `s${T}.${specIdx}`;
          specIdx += 1;
          this.#trySchedule(events, T, 'SPECTATOR', id, ...specParams(e.kind, e.data));
          break;
        }
        default: break; // kind tidak dikenal: tetap ikut di-hash, tanpa efek
      }
    }

    // 2. NPC.
    if (T === this.#npc.nextWarnTick) {
      const n = this.#npc.draw();
      this.#trySchedule(events, T, 'NPC', n.id, n.kind, n.lanes, n.durationIndex);
    }

    // 3. Aktivasi dan berakhirnya gangguan.
    for (const l of [...this.#live]) {
      if (l.phase === 'WARN' && l.d.activeTick === T) {
        l.phase = 'ACTIVE';
        if (l.d.kind === 'SPIKES') l.d.z = this.#z + SPIKES.aheadCm;
        events.push({ type: 'DISRUPTION_ACTIVE', tick: T, d: copy(l.d) });
      } else if (l.phase === 'ACTIVE' && l.d.endTick === T) {
        this.#live.splice(this.#live.indexOf(l), 1);
        events.push({ type: 'DISRUPTION_END', tick: T, d: copy(l.d) });
      }
    }

    // 4. Kecepatan.
    const car = this.#car;
    const nitroActive = this.#live.some((l) => l.phase === 'ACTIVE' && l.d.kind === 'NITRO');
    if (nitroActive) this.#speed = Math.min(Math.floor((car.maxSpeed * NITRO.speedNum) / NITRO.speedDen), this.#speed + NITRO.accel);
    else if (this.#speed > car.maxSpeed) this.#speed = Math.max(car.maxSpeed, this.#speed - NITRO.decay);
    else if (this.#braking) this.#speed = Math.max(MIN_SPEED, this.#speed - BRAKE_DECEL);
    else if (this.#slowTicks > 0) { /* tidak akselerasi */ }
    else this.#speed = Math.min(car.maxSpeed, this.#speed + car.accel);
    if (this.#slowTicks > 0) this.#slowTicks -= 1;

    // 5. Lateral: menuju pusat lajur target, tanpa melewatinya.
    const tx = laneCenter(this.#targetLane);
    if (this.#x < tx) this.#x = Math.min(tx, this.#x + car.lateral);
    else if (this.#x > tx) this.#x = Math.max(tx, this.#x - car.lateral);

    // 6. Maju.
    this.#z += this.#speed;

    // 7. Lalu lintas: spawn di depan, hapus yang sudah jauh di belakang.
    while (this.#nextRow.s + TRAFFIC_SPEED * T < this.#z + TRAFFIC.spawnAhead) {
      for (const v of this.#nextRow.vehicles) {
        const dim = v.type === VehicleType.TRUCK ? VEHICLE.TRUCK : VEHICLE.CAR;
        this.#vehicles.push({ id: v.id, lane: v.lane, type: v.type, s: this.#nextRow.s, w: dim.w, l: dim.l, track: newTrack() });
      }
      this.#nextRow = this.#rows.next().value;
    }
    const behind = this.#z - HALF_PL - TRAFFIC.despawnBehind;
    this.#vehicles = this.#vehicles.filter((v) => v.s + TRAFFIC_SPEED * T + v.l / 2 >= behind);

    // 8. Tabrakan.
    for (const v of this.#vehicles) {
      if (playerHits(this.#x, this.#z, laneCenter(v.lane), v.s + TRAFFIC_SPEED * T, v.w, v.l)) {
        events.push({ type: 'CRASH', tick: T, vehicleId: v.id });
        this.#end('CRASH');
        return events;
      }
    }

    // 9. Red zone aktif.
    for (const l of this.#live) {
      if (l.phase !== 'ACTIVE' || l.d.kind !== 'RED') continue;
      const lane = l.d.lanes.find((ln) => playerInLane(this.#x, ln));
      if (lane !== undefined) {
        events.push({ type: 'RED_ZONE_FAIL', tick: T, lane });
        this.#end('RED_ZONE_FAIL');
        return events;
      }
    }

    // 10. Rantai: kena sekali, lalu hilang setelah dilewati.
    for (const l of [...this.#live]) {
      if (l.phase !== 'ACTIVE' || l.d.kind !== 'SPIKES') continue;
      const sz = l.d.z!;
      if (!l.hit && playerHits(this.#x, this.#z, laneCenter(l.d.lanes[0]!), sz, SPIKES.w, SPIKES.l)) {
        l.hit = true;
        this.#speed = Math.max(MIN_SPEED, Math.floor(this.#speed / 2));
        this.#slowTicks = SPIKES.slowTicks;
        events.push({ type: 'SPIKES_HIT', tick: T });
      }
      if (this.#z - HALF_PL > sz + SPIKES.l / 2) {
        this.#live.splice(this.#live.indexOf(l), 1);
        events.push({ type: 'DISRUPTION_END', tick: T, d: copy(l.d) });
      }
    }

    // 11. Mepet.
    for (const v of this.#vehicles) {
      if (updateTrack(v.track, this.#x, this.#z, this.#speed, v.lane, v.s + TRAFFIC_SPEED * T, v.w, v.l)) {
        const coins = v.type === VehicleType.TRUCK ? VEHICLE.TRUCK.coins : VEHICLE.CAR.coins;
        this.#nearMisses += 1;
        this.#coins += coins;
        events.push({ type: 'NEAR_MISS', tick: T, index: this.#nearMisses, vehicleId: v.id, vehicleType: v.type, coins, inputHash: this.#hash });
      }
    }

    // 12. Waktu habis.
    if (T === RUN_TICKS) {
      events.push({ type: 'TIME_UP', tick: T });
      this.#end('TIME_UP');
    }

    return events;
  }

  view(): SimView {
    const T = this.#tick;
    return {
      tick: T,
      ended: this.#ended,
      endReason: this.#endReason,
      player: {
        x: this.#x,
        z: this.#z,
        speed: this.#speed,
        targetLane: this.#targetLane,
        braking: this.#braking,
        nitroActive: this.#live.some((l) => l.phase === 'ACTIVE' && l.d.kind === 'NITRO'),
        slowTicks: this.#slowTicks,
      },
      nearMisses: this.#nearMisses,
      coins: this.#coins,
      vehicles: this.#vehicles.map((v) => ({
        id: v.id, lane: v.lane, type: v.type, x: laneCenter(v.lane), z: v.s + TRAFFIC_SPEED * T, w: v.w, l: v.l,
      })),
      spikes: this.#live
        .filter((l) => l.phase === 'ACTIVE' && l.d.kind === 'SPIKES')
        .map((l) => ({ id: l.d.id, lane: l.d.lanes[0]!, z: l.d.z!, hit: l.hit })),
      redLanes: this.#live
        .filter((l) => l.d.kind === 'RED')
        .flatMap((l) => l.d.lanes.map((lane) => ({ lane, active: l.phase === 'ACTIVE', activeTick: l.d.activeTick, endTick: l.d.endTick! }))),
      disruptions: this.liveDisruptions(),
    };
  }

  #trySchedule(
    events: SimEvent[],
    T: number,
    source: Disruption['source'],
    id: string,
    kind: DisruptionKind,
    lanes: number[],
    durationIndex?: DurationIndex,
  ) {
    const d = buildDisruption({ id, source, kind, lanes, durationIndex, warnTick: T });
    if (canSchedule(this.#live.map((l) => l.d), d)) {
      this.#live.push({ d, phase: 'WARN', hit: false });
      events.push({ type: 'DISRUPTION_WARN', tick: T, d: copy(d) });
    } else {
      events.push({ type: 'DISRUPTION_DROPPED', tick: T, d: copy(d) });
    }
  }

  #end(reason: EndReasonName) {
    this.#ended = true;
    this.#endReason = reason;
  }
}

/** Parameter gangguan dari entri SPEC_* (TECH_SPEC §3.2). */
function specParams(kind: number, data: number): [DisruptionKind, number[], DurationIndex?] {
  if (kind === EntryKind.SPEC_NITRO) return ['NITRO', []];
  if (kind === EntryKind.SPEC_SPIKES) return ['SPIKES', [data]];
  const { lane, durationIndex } = decodeRedData(data);
  return ['RED', [lane], durationIndex];
}
