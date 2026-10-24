// Kode numerik yang dipakai bersama oleh sim, server, kontrak, dan frontend.
// Pakai objek `as const`, bukan `enum`, supaya bisa dijalankan tanpa transpile khusus.

/**
 * Jenis entri log input (TECH_SPEC §3.2). Nilai ini ikut di-hash, jangan diubah.
 * Sejak CONFIG_VERSION 2 setir bersifat tahan: LEFT/RIGHT = tombol ditekan, LEFT_OFF/RIGHT_OFF = dilepas.
 * Sejak CONFIG_VERSION 3 gas manual: ACCEL_ON/ACCEL_OFF = ↑ ditekan/dilepas.
 */
export const EntryKind = {
  LEFT: 1,
  RIGHT: 2,
  BRAKE_ON: 3,
  BRAKE_OFF: 4,
  LEFT_OFF: 5,
  RIGHT_OFF: 6,
  ACCEL_ON: 7,
  ACCEL_OFF: 8,
  SPEC_NITRO: 10,
  SPEC_SPIKES: 11,
  SPEC_RED: 12,
} as const;
export type EntryKind = (typeof EntryKind)[keyof typeof EntryKind];
export type PlayerInputKind =
  | typeof EntryKind.LEFT
  | typeof EntryKind.RIGHT
  | typeof EntryKind.BRAKE_ON
  | typeof EntryKind.BRAKE_OFF
  | typeof EntryKind.LEFT_OFF
  | typeof EntryKind.RIGHT_OFF
  | typeof EntryKind.ACCEL_ON
  | typeof EntryKind.ACCEL_OFF;
export type SpecEntryKind = typeof EntryKind.SPEC_NITRO | typeof EntryKind.SPEC_SPIKES | typeof EntryKind.SPEC_RED;

export const isPlayerInputKind = (k: number): k is PlayerInputKind => k >= 1 && k <= 8;
export const isSpecEntryKind = (k: number): k is SpecEntryKind => k >= 10 && k <= 12;

/** Alasan run berakhir, sama dengan `reason` di `RunRegistry` (TECH_SPEC §6.1). */
export const EndReason = {
  TIME_UP: 0,
  CRASH: 1,
  RED_ZONE_FAIL: 2,
  TIMEOUT: 3,
} as const;
export type EndReasonName = keyof typeof EndReason;
export type EndReasonCode = (typeof EndReason)[EndReasonName];

export const VehicleType = { CAR: 0, TRUCK: 1 } as const;
export type VehicleType = (typeof VehicleType)[keyof typeof VehicleType];

export type DisruptionKind = 'NITRO' | 'SPIKES' | 'RED';
export type DurationIndex = 0 | 1 | 2;

/** `SPEC_RED.data = lane | (durationIndex << 8)` (TECH_SPEC §3.2). */
export const encodeRedData = (lane: number, durationIndex: DurationIndex) => lane | (durationIndex << 8);
export const decodeRedData = (data: number) => ({ lane: data & 0xff, durationIndex: ((data >> 8) & 0xff) as DurationIndex });

/** Status siklus hidup run di backend (BACKEND_PLAN F2). */
export type RunLifecycle = 'CREATED' | 'READY' | 'RUNNING' | 'ENDED';
export type RunResultStatus = 'VERIFIED' | 'PARTIAL' | 'INVALID';
export type RunChainStatus = 'PENDING' | 'RECORDED' | 'RECORD_FAILED';
