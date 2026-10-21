// Tipe publik packages/sim (TECH_SPEC §3.2, §3.7). Bentuk ini final; isinya diisi bertahap.
import type { DisruptionKind, DurationIndex, EndReasonName, EntryKind, VehicleType } from '@racing-gang/config';
import type { Hex } from '@racing-gang/config/protocol';

export type { Hex };

/** Satu entri log. `seq` hanya untuk urutan di dalam tick yang sama; tidak ikut di-hash. */
export type LogEntry = { tick: number; kind: EntryKind; data: number; seq: number };

export type Disruption = {
  /** Deterministik dari log: NPC `n{k}`, penonton `s{warnTick}` (BACKEND_PLAN E). */
  id: string;
  source: 'NPC' | 'SPECTATOR';
  kind: DisruptionKind;
  lanes: number[];
  warnTick: number;
  activeTick: number;
  endTick?: number;
  /** Red zone: 0/1/2 = 3/5/7 detik. */
  durationIndex?: DurationIndex;
  /** Posisi rantai, diisi saat aktif. */
  z?: number;
};

export type SimEvent =
  | { type: 'NEAR_MISS'; tick: number; index: number; vehicleId: number; vehicleType: VehicleType; coins: number; inputHash: Hex }
  | { type: 'CRASH'; tick: number; vehicleId: number }
  | { type: 'RED_ZONE_FAIL'; tick: number; lane: number }
  | { type: 'TIME_UP'; tick: number }
  | { type: 'SPIKES_HIT'; tick: number }
  | { type: 'DISRUPTION_WARN' | 'DISRUPTION_ACTIVE' | 'DISRUPTION_END' | 'DISRUPTION_DROPPED'; tick: number; d: Disruption };

/** Satu baris lalu lintas dari generator (§3.5). Berisi 1–2 kendaraan. */
export type Row = { k: number; s: number; vehicles: { id: number; lane: number; type: VehicleType }[] };

export type VehicleView = {
  id: number;
  lane: number;
  type: VehicleType;
  /** Pusat lateral (cm). */
  x: number;
  /** Pusat longitudinal (cm), di ruang yang sama dengan player.z. */
  z: number;
  w: number;
  l: number;
};

/** State untuk render dan HUD. Jangan dipakai untuk logika; ambil ulang setiap tick. */
export type SimView = {
  tick: number;
  ended: boolean;
  endReason: EndReasonName | null;
  player: {
    x: number;
    z: number;
    speed: number;
    targetLane: number;
    braking: boolean;
    nitroActive: boolean;
    slowTicks: number;
  };
  nearMisses: number;
  coins: number;
  vehicles: VehicleView[];
  spikes: { id: string; lane: number; z: number; hit: boolean }[];
  redLanes: { lane: number; active: boolean; activeTick: number; endTick: number }[];
  /** Gangguan yang sedang aba-aba atau aktif. */
  disruptions: Disruption[];
};

export type SimParams = { runId: Hex; seed: Hex; carTier: number };
