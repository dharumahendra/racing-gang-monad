// Gangguan: nitro paksa, rantai (SPIKES), red zone (TECH_SPEC §3.7).
import { LANES, LIMITS, NITRO, RED_ZONE_DURATIONS, WARN_TICKS, type DisruptionKind, type DurationIndex } from '@racing-gang/config';
import type { Disruption } from './types';

export function buildDisruption(p: {
  id: string;
  source: Disruption['source'];
  kind: DisruptionKind;
  lanes: number[];
  durationIndex?: DurationIndex;
  warnTick: number;
}): Disruption {
  const activeTick = p.warnTick + WARN_TICKS;
  const d: Disruption = { id: p.id, source: p.source, kind: p.kind, lanes: p.lanes, warnTick: p.warnTick, activeTick };
  if (p.kind === 'NITRO') d.endTick = activeTick + NITRO.durationTicks;
  if (p.kind === 'RED') {
    d.durationIndex = p.durationIndex ?? 0;
    d.endTick = activeTick + (RED_ZONE_DURATIONS[d.durationIndex] ?? RED_ZONE_DURATIONS[0]);
  }
  return d;
}

const validLane = (l: number) => Number.isInteger(l) && l >= 0 && l < LANES;

/** Bentuk gangguan valid: nitro tanpa lajur, rantai 1 lajur, red zone 1–2 lajur bersebelahan. */
export function isWellFormed(d: Disruption): boolean {
  if (d.kind === 'NITRO') return d.lanes.length === 0;
  if (d.kind === 'SPIKES') return d.lanes.length === 1 && validLane(d.lanes[0]!);
  if (!(d.durationIndex === 0 || d.durationIndex === 1 || d.durationIndex === 2)) return false;
  if (d.lanes.length === 1) return validLane(d.lanes[0]!);
  return d.lanes.length === 2 && validLane(d.lanes[0]!) && d.lanes[1] === d.lanes[0]! + 1 && validLane(d.lanes[1]!);
}

/**
 * Apakah `cand` boleh ditambahkan ke gangguan yang sedang aba-aba atau aktif (`live`).
 * Fungsi murni: dipakai sim (trySchedule) dan server (cek awal gangguan penonton).
 */
export function canSchedule(live: readonly Disruption[], cand: Disruption): boolean {
  if (!isWellFormed(cand)) return false;
  const all = [...live, cand];
  if (all.filter((d) => d.kind === 'NITRO').length > LIMITS.maxNitro) return false;
  if (all.filter((d) => d.kind === 'SPIKES').length > LIMITS.maxSpikes) return false;
  const redLanes = new Set(all.filter((d) => d.kind === 'RED').flatMap((d) => d.lanes));
  if (redLanes.size > LIMITS.maxRedLanes) return false;
  for (const d of live) if (Math.abs(d.activeTick - cand.activeTick) < LIMITS.minActivationGapTicks) return false;
  return true;
}
