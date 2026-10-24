import { describe, expect, it } from 'vitest';
import { CARS, EntryKind, LIMITS, NPC, RED_ZONE_DURATIONS, encodeRedData, type DurationIndex } from '@racing-gang/config';
import { buildDisruption, canSchedule } from '../src/disruptions';
import { playerInLane } from '../src/geometry';
import { NpcScheduler } from '../src/npc';
import { Sim } from '../src/sim';
import type { Disruption, SimEvent } from '../src/types';
import { drive, findRun, hex } from './helpers';

const mk = (kind: Disruption['kind'], lanes: number[], warnTick: number, durationIndex?: DurationIndex) =>
  buildDisruption({ id: `t${warnTick}`, source: 'SPECTATOR', kind, lanes, durationIndex, warnTick });

describe('canSchedule (§3.7)', () => {
  it('aba-aba 60 tick dan durasi aktif', () => {
    const n = mk('NITRO', [], 100);
    expect(n.activeTick).toBe(160);
    expect(n.endTick).toBe(250);
    [0, 1, 2].forEach((i) => expect(mk('RED', [0], 100, i as DurationIndex).endTick).toBe(160 + RED_ZONE_DURATIONS[i]!));
    expect(mk('SPIKES', [1], 100).endTick).toBeUndefined();
  });

  it('maksimal 1 nitro, 2 rantai, 2 lajur merah', () => {
    expect(canSchedule([mk('NITRO', [], 0)], mk('NITRO', [], 500))).toBe(false);
    expect(canSchedule([mk('SPIKES', [0], 0), mk('SPIKES', [1], 100)], mk('SPIKES', [2], 500))).toBe(false);
    expect(canSchedule([mk('SPIKES', [0], 0)], mk('SPIKES', [1], 500))).toBe(true);
    expect(canSchedule([mk('RED', [0, 1], 0, 0)], mk('RED', [2], 500, 0))).toBe(false);
    expect(canSchedule([mk('RED', [0, 1], 0, 0)], mk('RED', [1], 500, 0))).toBe(true);
  });

  it('jeda aktivasi minimal 30 tick', () => {
    expect(canSchedule([mk('NITRO', [], 100)], mk('SPIKES', [0], 100 + LIMITS.minActivationGapTicks - 1))).toBe(false);
    expect(canSchedule([mk('NITRO', [], 100)], mk('SPIKES', [0], 100 + LIMITS.minActivationGapTicks))).toBe(true);
  });

  it('bentuk tidak valid ditolak', () => {
    expect(canSchedule([], mk('SPIKES', [4], 0))).toBe(false);
    expect(canSchedule([], mk('RED', [1, 3], 0, 0))).toBe(false);
    expect(canSchedule([], mk('RED', [3, 4], 0, 0))).toBe(false);
    expect(canSchedule([], mk('NITRO', [1], 0))).toBe(false);
    expect(canSchedule([], { ...mk('RED', [1], 0, 0), durationIndex: 3 as DurationIndex })).toBe(false);
    expect(canSchedule([], mk('RED', [2, 3], 0, 2))).toBe(true);
  });
});

describe('NPC', () => {
  it('jadwal deterministik, mulai tick 300, interval 240–360', () => {
    const a = new NpcScheduler(hex('npc'));
    const b = new NpcScheduler(hex('npc'));
    expect(a.nextWarnTick).toBe(NPC.firstWarnTick);
    const counts = { NITRO: 0, SPIKES: 0, RED: 0 };
    for (let i = 0; i < 3000; i++) {
      const before = a.nextWarnTick;
      const da = a.draw();
      expect(b.draw()).toEqual(da);
      const interval = a.nextWarnTick - before;
      expect(interval >= NPC.intervalMin && interval <= NPC.intervalMax).toBe(true);
      expect(canSchedule([], buildDisruption({ ...da, source: 'NPC', warnTick: 0 }))).toBe(true);
      counts[da.kind]++;
    }
    expect(counts.NITRO / 3000).toBeCloseTo(0.35, 1);
    expect(counts.SPIKES / 3000).toBeCloseTo(0.4, 1);
  });

  it('jadwal NPC di sim tidak bergeser oleh gangguan penonton', () => {
    const npcOf = (events: SimEvent[]) =>
      events.filter((e) => 'd' in e && e.d.source === 'NPC' && (e.type === 'DISRUPTION_WARN' || e.type === 'DISRUPTION_DROPPED'))
        .map((e) => ('d' in e ? { id: e.d.id, kind: e.d.kind, lanes: e.d.lanes, warnTick: e.d.warnTick } : null));
    for (let i = 0; i < 10; i++) {
      const quiet = drive({ i, carTier: 0 });
      const noisy = drive({ i, carTier: 0, inject: (T) => (T % 97 === 0 ? [{ kind: EntryKind.SPEC_NITRO, data: 0 }] : []) });
      const until = Math.min(quiet.sim.tick, noisy.sim.tick);
      const a = npcOf(quiet.events).filter((d) => d!.warnTick <= until);
      const b = npcOf(noisy.events).filter((d) => d!.warnTick <= until);
      expect(b).toEqual(a);
      const sched = new NpcScheduler(hex(`seed-${i}`));
      for (const d of a) {
        expect(d!.warnTick).toBe(sched.nextWarnTick);
        expect(sched.draw().id).toBe(d!.id);
      }
    }
  });
});

describe('gangguan di sim', () => {
  it('invarian setiap tick: batas dipatuhi, aba-aba selalu 60 tick, durasi tepat', () => {
    for (let i = 0; i < 25; i++) {
      const { events, views } = drive({
        i,
        carTier: i % 3,
        inject: (T) => {
          if (T % 37 === 0) return [{ kind: EntryKind.SPEC_RED, data: encodeRedData(T % 4, (T % 3) as DurationIndex) }];
          if (T % 41 === 0) return [{ kind: EntryKind.SPEC_SPIKES, data: T % 4 }];
          if (T % 43 === 0) return [{ kind: EntryKind.SPEC_NITRO, data: 0 }];
          return [];
        },
      });
      for (const v of views) {
        expect(v.disruptions.filter((d) => d.kind === 'NITRO').length).toBeLessThanOrEqual(1);
        expect(v.disruptions.filter((d) => d.kind === 'SPIKES').length).toBeLessThanOrEqual(2);
        expect(new Set(v.redLanes.map((r) => r.lane)).size).toBeLessThanOrEqual(2);
      }
      for (const e of events) {
        if (e.type === 'DISRUPTION_WARN') expect(e.d.activeTick - e.d.warnTick).toBe(60);
        if (e.type === 'DISRUPTION_ACTIVE') expect(e.tick).toBe(e.d.activeTick);
        if (e.type === 'DISRUPTION_END' && e.d.kind !== 'SPIKES') expect(e.tick).toBe(e.d.endTick);
      }
      // jeda aktivasi ≥ 30 tick antar-gangguan yang hidup bersamaan
      for (const v of views) {
        const ticks = v.disruptions.map((d) => d.activeTick).sort((a, b) => a - b);
        for (let k = 1; k < ticks.length; k++) expect(ticks[k]! - ticks[k - 1]!).toBeGreaterThanOrEqual(LIMITS.minActivationGapTicks);
      }
    }
  });

  it('ID penonton deterministik: s{T}, s{T}.1; data tidak valid → DROPPED', () => {
    const sim = new Sim({ runId: hex('r'), seed: hex('s'), carTier: 0 });
    const ev = sim.step([
      { tick: 1, kind: EntryKind.SPEC_SPIKES, data: 9, seq: 0 },
      { tick: 1, kind: EntryKind.SPEC_NITRO, data: 0, seq: 1 },
    ]);
    expect(ev).toEqual([
      { type: 'DISRUPTION_DROPPED', tick: 1, d: expect.objectContaining({ id: 's1', kind: 'SPIKES', lanes: [9] }) },
      { type: 'DISRUPTION_WARN', tick: 1, d: expect.objectContaining({ id: 's1.1', kind: 'NITRO', source: 'SPECTATOR', activeTick: 61 }) },
    ]);
  });

  it('nitro mengabaikan rem, lalu turun 3 per tick ke maxSpeed', () => {
    const max = CARS[0].maxSpeed;
    const boosted = Math.floor((max * 3) / 2);
    const r = findRun(
      (i) => drive({
        i, carTier: 0, autopilot: { noBrake: true }, maxTick: 260,
        inject: (T) => (T === 1 ? [{ kind: EntryKind.SPEC_NITRO, data: 0 }, { kind: EntryKind.BRAKE_ON, data: 0 }] : []),
      }),
      (r) => r.sim.tick === 260 && !r.sim.ended,
    );
    const sp = (T: number) => r.views[T]!.player.speed;
    expect(sp(60)).toBe(80);                 // rem bekerja saat aba-aba
    expect(sp(61)).toBe(86);                 // nitro aktif: +6 walau rem ditekan
    expect(r.views[61]!.player.nitroActive).toBe(true);
    expect(sp(100)).toBe(boosted);
    expect(sp(150)).toBe(boosted);
    expect(sp(151)).toBe(boosted - 3);       // nitro selesai di endTick 151
    expect(sp(178)).toBe(max);
    expect(sp(260)).toBe(80);                // setelah kembali normal, rem bekerja lagi
  });

  it('rantai memotong kecepatan setengah dan menahan akselerasi 45 tick', () => {
    let lane = -1;
    const r = findRun(
      (i) => drive({
        i, carTier: 0, autopilot: { noBrake: true, ignoreSpikes: true, stay: true }, maxTick: 290,
        inject: (T, sim) => {
          if (T !== 100) return [];
          lane = sim.view().player.targetLane;
          return [{ kind: EntryKind.SPEC_SPIKES, data: lane }];
        },
      }),
      (r) => r.events.some((e) => e.type === 'SPIKES_HIT') && r.sim.tick === 290,
    );
    const H = r.events.find((e) => e.type === 'SPIKES_HIT')!.tick;
    const pre = r.views[H - 1]!.player.speed;
    const max = CARS[0].maxSpeed;
    expect(r.views[H]!.player.speed).toBe(Math.max(80, Math.floor(Math.min(max, pre + 1) / 2)));
    for (let T = H + 1; T <= H + 45; T++) expect(r.views[T]!.player.speed).toBe(r.views[H]!.player.speed);
    expect(r.views[H + 46]!.player.speed).toBe(r.views[H]!.player.speed + 1);
    expect(r.events.some((e) => e.type === 'DISRUPTION_END' && e.d.kind === 'SPIKES')).toBe(true);
    expect(lane).toBeGreaterThanOrEqual(0);
  });

  it('red zone hanya menggagalkan run saat aktif', () => {
    let failsAtActivation = 0;
    for (let i = 0; i < 40; i++) {
      let lane = -1;
      const r = drive({
        i, carTier: 0, autopilot: { ignoreRed: true, stay: true }, maxTick: 400,
        inject: (T, sim) => {
          if (T !== 100) return [];
          lane = sim.view().player.targetLane;
          return [{ kind: EntryKind.SPEC_RED, data: encodeRedData(lane, 2) }];
        },
      });
      const fail = r.events.find((e) => e.type === 'RED_ZONE_FAIL');
      // selama aba-aba (tick 100–159) pemain boleh berada di lajur merah tanpa gagal
      if (fail) {
        expect(fail.tick).toBeGreaterThanOrEqual(160);
        expect(fail.tick).toBeLessThan(160 + RED_ZONE_DURATIONS[2]);
        if (fail.tick === 160) {
          failsAtActivation++;
          expect(playerInLane(r.views[159]!.player.x, lane)).toBe(true);
        }
      }
    }
    expect(failsAtActivation).toBeGreaterThan(0);
  });
});
