import { keccak256, toHex } from 'viem';
import type { EntryKind } from '@racing-gang/config';
import { Autopilot, type AutopilotOptions } from '../src/dev/autopilot';
import { Sim } from '../src/sim';
import type { Hex, LogEntry, SimEvent, SimView } from '../src/types';

export const hex = (label: string): Hex => keccak256(toHex(label));

export type DriveResult = { sim: Sim; events: SimEvent[]; views: SimView[] };

/**
 * Mainkan run dengan autopilot. `inject(T, sim)` menambahkan entri (SPEC_* atau input) untuk tick T.
 * `views[T]` = state setelah tick T (views[0] = awal).
 */
export function drive(p: {
  i: number;
  carTier: number;
  autopilot?: AutopilotOptions;
  inject?: (T: number, sim: Sim) => { kind: number; data: number }[];
  maxTick?: number;
}): DriveResult {
  const sim = new Sim({ runId: hex(`run-${p.i}`), seed: hex(`seed-${p.i}`), carTier: p.carTier });
  const ap = new Autopilot(p.autopilot);
  const events: SimEvent[] = [];
  const views: SimView[] = [sim.view()];
  let pending = ap.decide(sim.view(), p.carTier);
  while (!sim.ended && sim.tick < (p.maxTick ?? 3000)) {
    const T = sim.tick + 1;
    let seq = 0;
    const list: LogEntry[] = [];
    for (const e of p.inject?.(T, sim) ?? []) list.push({ tick: T, kind: e.kind as EntryKind, data: e.data, seq: seq++ });
    for (const kind of pending) list.push({ tick: T, kind, data: 0, seq: seq++ });
    events.push(...sim.step(list));
    views.push(sim.view());
    pending = sim.ended ? [] : ap.decide(sim.view(), p.carTier);
  }
  return { sim, events, views };
}

/** Cari run deterministik pertama (seed 0..maxSeeds-1) yang memenuhi `pred`. */
export function findRun(
  make: (i: number) => DriveResult,
  pred: (r: DriveResult) => boolean,
  maxSeeds = 200,
): DriveResult {
  for (let i = 0; i < maxSeeds; i++) {
    const r = make(i);
    if (pred(r)) return r;
  }
  throw new Error('Tidak ada seed yang memenuhi skenario');
}
