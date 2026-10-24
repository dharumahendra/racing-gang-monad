// Alat bantu pengembangan (autopilot, perekam run). Jangan dipakai di logika game.
import { CONFIG_VERSION, EntryKind, RUN_TICKS } from '@racing-gang/config';
import { Sim } from '../sim';
import type { Hex, LogEntry, SimEvent } from '../types';
import { Autopilot, type AutopilotOptions } from './autopilot';

export { Autopilot, type AutopilotOptions };

export type RecordedRun = {
  runId: Hex;
  seed: Hex;
  carTier: number;
  configVersion: number;
  entries: { tick: number; kind: number; data: number }[];
  events: SimEvent[];
  endTick: number;
  endReason: string | null;
  nearMisses: number;
  finalHash: Hex;
};

/**
 * Mainkan satu run dengan autopilot. `spec(tick)` boleh mengembalikan entri gangguan penonton
 * untuk tick itu (kind SPEC_* dan data). Log dicatat sesuai urutan proses: SPEC dulu, lalu input.
 */
export function playRun(p: {
  runId: Hex;
  seed: Hex;
  carTier: number;
  autopilot?: AutopilotOptions;
  spec?: (tick: number, sim: Sim) => { kind: number; data: number }[];
  /** Input tambahan dari test, di luar autopilot. */
  extra?: (tick: number, sim: Sim) => { kind: number; data: number }[];
  maxTick?: number;
}): RecordedRun {
  const sim = new Sim(p);
  const ap = new Autopilot(p.autopilot);
  const entries: RecordedRun['entries'] = [];
  const events: SimEvent[] = [];
  let pending = ap.decide(sim.view(), p.carTier);
  const maxTick = p.maxTick ?? RUN_TICKS;
  while (!sim.ended && sim.tick < maxTick) {
    const T = sim.tick + 1;
    const list: LogEntry[] = [];
    let seq = 0;
    for (const s of p.spec?.(T, sim) ?? []) list.push({ tick: T, kind: s.kind as EntryKind, data: s.data, seq: seq++ });
    for (const kind of pending) list.push({ tick: T, kind, data: 0, seq: seq++ });
    for (const x of p.extra?.(T, sim) ?? []) list.push({ tick: T, kind: x.kind as EntryKind, data: x.data, seq: seq++ });
    for (const e of list) entries.push({ tick: e.tick, kind: e.kind, data: e.data });
    events.push(...sim.step(list));
    pending = sim.ended ? [] : ap.decide(sim.view(), p.carTier);
  }
  return {
    runId: p.runId,
    seed: p.seed,
    carTier: p.carTier,
    configVersion: CONFIG_VERSION,
    entries,
    events,
    endTick: sim.tick,
    endReason: sim.endReason,
    nearMisses: sim.nearMisses,
    finalHash: sim.inputHash,
  };
}
