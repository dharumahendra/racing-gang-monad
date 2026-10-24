import { describe, expect, it } from 'vitest';
import { EntryKind } from '@racing-gang/config';
import { auditRun } from '../src/audit';
import { playRun } from '../src/dev/index';
import { hex } from './helpers';

const run = playRun({ runId: hex('audit-run'), seed: hex('audit-seed'), carTier: 0 });
const log = { runId: run.runId, seed: run.seed, carTier: run.carTier, entries: run.entries };
const recorded = run.events.flatMap((e) => (e.type === 'NEAR_MISS' ? [{ index: e.index, tick: e.tick, vehicleType: e.vehicleType, inputHash: e.inputHash }] : []));
const end = { endTick: run.endTick, totalNearMisses: run.nearMisses, finalInputHash: run.finalHash };

describe('auditRun', () => {
  it('log asli + catatan asli → semua cocok', () => {
    expect(recorded.length).toBeGreaterThan(3);
    const a = auditRun(log, { seed: run.seed, nearMisses: recorded, end });
    expect(a).toMatchObject({ ok: true, seedOk: true, endOk: true, problems: [] });
    expect(a.rows.every((r) => r.ok)).toBe(true);
  });

  it('log diubah satu input → mepet setelahnya tidak cocok (inputHash berubah)', () => {
    const tampered = { ...log, entries: log.entries.map((e, i) => (i === 0 ? { ...e, tick: e.tick + 1 } : e)) };
    const a = auditRun(tampered, { nearMisses: recorded, end });
    expect(a.ok).toBe(false);
    expect(a.rows.some((r) => !r.ok)).toBe(true);
  });

  it('catatan diubah: tick palsu, mepet tambahan, seed lain, hash akhir lain → terdeteksi', () => {
    const fake = recorded.map((n, i) => (i === 1 ? { ...n, tick: n.tick + 1 } : n));
    expect(auditRun(log, { nearMisses: fake }).rows[1]).toMatchObject({ ok: false });
    const extra = [...recorded, { ...recorded[0]!, index: recorded.length + 1 }];
    expect(auditRun(log, { nearMisses: extra }).rows.at(-1)).toMatchObject({ ok: false, replayed: null });
    expect(auditRun(log, { seed: hex('lain'), nearMisses: recorded }).seedOk).toBe(false);
    expect(auditRun(log, { nearMisses: recorded, end: { ...end, finalInputHash: hex('x') } }).endOk).toBe(false);
  });

  it('gangguan penonton yang ikut di log tetap ter-replay identik', () => {
    const withSpec = playRun({
      runId: hex('audit-spec'), seed: hex('audit-spec-seed'), carTier: 1,
      spec: (t) => (t % 150 === 0 ? [{ kind: EntryKind.SPEC_SPIKES, data: t % 4 }] : []),
    });
    const rec = withSpec.events.flatMap((e) => (e.type === 'NEAR_MISS' ? [{ index: e.index, tick: e.tick, vehicleType: e.vehicleType, inputHash: e.inputHash }] : []));
    const a = auditRun(
      { runId: withSpec.runId, seed: withSpec.seed, carTier: 1, entries: withSpec.entries },
      { nearMisses: rec, end: { endTick: withSpec.endTick, totalNearMisses: withSpec.nearMisses, finalInputHash: withSpec.finalHash } },
    );
    expect(a.ok).toBe(true);
  });
});
