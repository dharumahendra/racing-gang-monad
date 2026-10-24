// Replay log run (dipakai halaman audit, golden test, dan server saat timeout).
import { RUN_TICKS, type EndReasonName, type EntryKind } from '@racing-gang/config';
import { Sim } from './sim';
import type { Hex, LogEntry, SimEvent, SimParams } from './types';

export type ReplayInput = SimParams & {
  /** Entri sesuai urutan proses (GET /runs/:id/log). */
  entries: { tick: number; kind: number; data: number }[];
  /** Untuk run PARTIAL: berhenti di tick ini walaupun sim belum selesai. */
  endTick?: number;
};

export type ReplayResult = {
  events: SimEvent[];
  endTick: number;
  ended: boolean;
  endReason: EndReasonName | null;
  nearMisses: number;
  finalHash: Hex;
};

export function replay(input: ReplayInput): ReplayResult {
  const sim = new Sim(input);
  const byTick = new Map<number, LogEntry[]>();
  input.entries.forEach((e, i) => {
    const list = byTick.get(e.tick) ?? [];
    // seq = posisi di log, jadi urutan proses yang tersimpan tetap terjaga.
    list.push({ tick: e.tick, kind: e.kind as EntryKind, data: e.data, seq: i });
    byTick.set(e.tick, list);
  });
  const limit = Math.min(input.endTick ?? RUN_TICKS, RUN_TICKS);
  const events: SimEvent[] = [];
  while (!sim.ended && sim.tick < limit) events.push(...sim.step(byTick.get(sim.tick + 1) ?? []));
  return {
    events,
    endTick: sim.tick,
    ended: sim.ended,
    endReason: sim.endReason,
    nearMisses: sim.nearMisses,
    finalHash: sim.inputHash,
  };
}
