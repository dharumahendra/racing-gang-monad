// Audit run (PRD §9.1, TECH_SPEC §8.5): replay log publik lalu cocokkan dengan catatan (on-chain atau backend).
// Dipakai CLI backend (scripts/audit.ts) dan bisa dipakai halaman audit /run/:id supaya aturannya sama persis.
import { replay, type ReplayInput } from './replay';
import type { Hex } from './types';

export type RecordedNearMiss = { index: number; tick: number; vehicleType: number; inputHash: Hex };
export type AuditRecords = {
  /** Seed dari event RunStarted; kalau ada, harus sama dengan seed di log. */
  seed?: Hex;
  nearMisses: RecordedNearMiss[];
  /** Dari event RunEnded (atau ringkasan backend); kalau ada, replay berhenti di endTick ini. */
  end?: { endTick: number; totalNearMisses: number; finalInputHash?: Hex };
};

export type AuditRow = {
  index: number;
  ok: boolean;
  replayed: RecordedNearMiss | null;
  recorded: RecordedNearMiss | null;
  problem?: string;
};

export type AuditResult = {
  ok: boolean;
  seedOk: boolean | null;
  endOk: boolean | null;
  rows: AuditRow[];
  replayEndTick: number;
  replayFinalHash: Hex;
  problems: string[];
};

const same = (a: RecordedNearMiss, b: RecordedNearMiss) =>
  a.index === b.index && a.tick === b.tick && a.vehicleType === b.vehicleType && a.inputHash.toLowerCase() === b.inputHash.toLowerCase();

export function auditRun(log: ReplayInput, rec: AuditRecords): AuditResult {
  const problems: string[] = [];
  const seedOk = rec.seed === undefined ? null : rec.seed.toLowerCase() === log.seed.toLowerCase();
  if (seedOk === false) problems.push('seed di log berbeda dengan seed on-chain');

  const r = replay({ ...log, endTick: rec.end?.endTick ?? log.endTick });
  const replayed = r.events.flatMap((e) =>
    e.type === 'NEAR_MISS' ? [{ index: e.index, tick: e.tick, vehicleType: e.vehicleType, inputHash: e.inputHash }] : [],
  );

  const byIndex = new Map(rec.nearMisses.map((n) => [n.index, n]));
  const indices = [...new Set([...replayed.map((n) => n.index), ...byIndex.keys()])].sort((a, b) => a - b);
  const rows: AuditRow[] = indices.map((index) => {
    const a = replayed.find((n) => n.index === index) ?? null;
    const b = byIndex.get(index) ?? null;
    if (!a) return { index, ok: false, replayed: a, recorded: b, problem: 'tercatat tapi tidak muncul saat replay' };
    if (!b) return { index, ok: false, replayed: a, recorded: b, problem: 'muncul saat replay tapi tidak tercatat' };
    if (!same(a, b)) return { index, ok: false, replayed: a, recorded: b, problem: 'tick, jenis kendaraan, atau inputHash berbeda' };
    return { index, ok: true, replayed: a, recorded: b };
  });
  const bad = rows.filter((x) => !x.ok).length;
  if (bad) problems.push(`${bad} mepet tidak cocok`);

  let endOk: boolean | null = null;
  if (rec.end) {
    endOk =
      r.endTick === rec.end.endTick &&
      r.nearMisses === rec.end.totalNearMisses &&
      (rec.end.finalInputHash === undefined || rec.end.finalInputHash.toLowerCase() === r.finalHash.toLowerCase());
    if (!endOk) problems.push('akhir run (tick, jumlah mepet, atau hash akhir) tidak cocok');
  }

  return { ok: problems.length === 0, seedOk, endOk, rows, replayEndTick: r.endTick, replayFinalHash: r.finalHash, problems };
}
