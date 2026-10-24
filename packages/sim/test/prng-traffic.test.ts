import { describe, expect, it } from 'vitest';
import { LANES, TRAFFIC } from '@racing-gang/config';
import { lerpInt, makeRng } from '../src/prng';
import { trafficRows } from '../src/traffic';
import type { Row } from '../src/types';
import { hex } from './helpers';

const take = (seed: `0x${string}`, n: number): Row[] => {
  const g = trafficRows(seed);
  return Array.from({ length: n }, () => g.next().value);
};

describe('PRNG (§3.3)', () => {
  const seed = `0x${'cd'.repeat(32)}` as const;

  it('vektor tetap per stream (jangan diubah tanpa naik CONFIG_VERSION)', () => {
    const t = makeRng(seed, 'traffic');
    const n = makeRng(seed, 'npc');
    expect(Array.from({ length: 10 }, () => t.next())).toEqual(
      [2975357008, 1926054289, 1558223762, 932036789, 1948299823, 3436454670, 1044663288, 507965336, 2356624910, 2319199283],
    );
    expect(Array.from({ length: 10 }, () => n.next())).toEqual(
      [3734743914, 122517262, 241534189, 3839251128, 330131885, 3676803096, 2006972901, 1304993554, 3714832636, 3748250578],
    );
  });

  it('int dan chance dalam batas', () => {
    const r = makeRng(seed, 'traffic');
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = r.int(0, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
      const w = r.int(240, 360);
      expect(w >= 240 && w <= 360).toBe(true);
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1000)).toBe(true);
    }
    expect(seen.size).toBe(4);
  });

  it('lerpInt memakai floor, termasuk untuk nilai menurun', () => {
    expect(lerpInt(2800, 1600, 0, 300000)).toBe(2800);
    expect(lerpInt(2800, 1600, 300000, 300000)).toBe(1600);
    expect(lerpInt(2800, 1600, 1, 300000)).toBe(2799);
    expect(lerpInt(150, 500, 150000, 300000)).toBe(325);
  });
});

describe('generator lalu lintas (§3.5)', () => {
  it('deterministik dari seed', () => {
    expect(take(hex('a'), 50)).toEqual(take(hex('a'), 50));
    expect(take(hex('a'), 50)).not.toEqual(take(hex('b'), 50));
  });

  it('1.000 seed: tidak pernah ada tembok, struktur baris valid', () => {
    const bad: string[] = [];
    for (let i = 0; i < 1000; i++) {
      let prev: Row | undefined;
      for (const row of take(hex(`wall-${i}`), 250)) {
        const lanes = row.vehicles.map((v) => v.lane);
        const where = `seed ${i} row ${row.k}`;
        if (lanes.length < 1 || lanes.length > 2 || new Set(lanes).size !== lanes.length) bad.push(`${where}: lajur ${lanes}`);
        row.vehicles.forEach((v, slot) => {
          if (v.id !== row.k * 2 + slot || v.lane < 0 || v.lane >= LANES) bad.push(`${where}: kendaraan ${JSON.stringify(v)}`);
        });
        if (prev) {
          const gap = row.s - prev.s;
          if (gap < TRAFFIC.gapEnd || gap > TRAFFIC.gapStart + TRAFFIC.gapJitter) bad.push(`${where}: gap ${gap}`);
          const prevLanes = prev.vehicles.map((v) => v.lane);
          if (![0, 1, 2, 3].some((l) => !lanes.includes(l) && !prevLanes.includes(l))) bad.push(`${where}: tembok`);
        }
        prev = row;
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('kepadatan naik seiring jarak', () => {
    let earlyTwo = 0, early = 0, lateTwo = 0, late = 0;
    for (let i = 0; i < 200; i++) {
      for (const row of take(hex(`dens-${i}`), 200)) {
        if (row.s < 30000) { early++; if (row.vehicles.length === 2) earlyTwo++; }
        if (row.s >= TRAFFIC.rampS) { late++; if (row.vehicles.length === 2) lateTwo++; }
      }
    }
    expect(late).toBeGreaterThan(0);
    expect(lateTwo / late).toBeGreaterThan(earlyTwo / early + 0.15);
  });
});
