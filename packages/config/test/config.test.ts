import { describe, expect, it } from 'vitest';
import {
  CARS,
  EntryKind,
  MIN_SPEED,
  NEAR_MISS_MIN_SPEED,
  PLAYER_START_SPEED,
  TRAFFIC_SPEED,
  buildCarsJson,
  decodeRedData,
  disruptionCost,
  encodeRedData,
  getDeployment,
  laneCenter,
  monToWei,
  toKmh,
} from '../src/index';

describe('config', () => {
  it('monToWei tanpa float', () => {
    expect(monToWei('0')).toBe(0n);
    expect(monToWei('0.05')).toBe(50_000_000_000_000_000n);
    expect(monToWei('0.25')).toBe(250_000_000_000_000_000n);
    expect(monToWei('1')).toBe(10n ** 18n);
    expect(() => monToWei('1e3')).toThrow();
  });

  it('cars.json sesuai PRD §6.2', () => {
    const j = buildCarsJson();
    expect(j.reqNearMiss).toEqual([0, 40, 75, 110, 150]);
    expect(j.minCarTier).toEqual([0, 0, 1, 2, 3]);
    expect(j.supply).toEqual([0, 1000, 300, 100, 30]);
    expect(j.priceWei).toEqual(['0', '50000000000000000', '100000000000000000', '250000000000000000', '500000000000000000']);
  });

  it('tier berurutan dan syarat naik', () => {
    CARS.forEach((c, i) => expect(c.tier).toBe(i));
    for (let i = 1; i < CARS.length; i++) {
      expect(CARS[i]!.reqNearMiss).toBeGreaterThan(CARS[i - 1]!.reqNearMiss);
      expect(CARS[i]!.maxSpeed).toBeGreaterThan(CARS[i - 1]!.maxSpeed);
    }
  });

  it('kecepatan v3: mulai 40 km/j di bawah lalu lintas; maks 160 km/j lalu +30 per tier; mepet butuh menyalip', () => {
    expect(toKmh(PLAYER_START_SPEED)).toBe(40);
    expect(MIN_SPEED).toBe(PLAYER_START_SPEED);
    expect(MIN_SPEED).toBeLessThan(TRAFFIC_SPEED); // lalu lintas dari belakang bisa menyusul
    expect(NEAR_MISS_MIN_SPEED).toBeGreaterThan(TRAFFIC_SPEED);
    CARS.forEach((c, i) => {
      expect(c.maxKmh).toBe(160 + 30 * i);
      expect(Math.abs(toKmh(c.maxSpeed) - c.maxKmh)).toBeLessThanOrEqual(1);
      expect(c.maxSpeed).toBeGreaterThan(NEAR_MISS_MIN_SPEED);
    });
  });

  it('laneCenter', () => {
    expect([0, 1, 2, 3].map(laneCenter)).toEqual([175, 525, 875, 1225]);
  });

  it('encode/decode SPEC_RED data', () => {
    expect(encodeRedData(3, 2)).toBe(3 | (2 << 8));
    expect(decodeRedData(encodeRedData(2, 1))).toEqual({ lane: 2, durationIndex: 1 });
  });

  it('biaya energi gangguan', () => {
    expect(disruptionCost('NITRO')).toBe(30);
    expect(disruptionCost('SPIKES')).toBe(35);
    expect([0, 1, 2].map((d) => disruptionCost('RED', d))).toEqual([45, 60, 80]);
  });

  it('kode EntryKind tidak berubah (ikut di-hash)', () => {
    expect(EntryKind).toEqual({ LEFT: 1, RIGHT: 2, BRAKE_ON: 3, BRAKE_OFF: 4, LEFT_OFF: 5, RIGHT_OFF: 6, ACCEL_ON: 7, ACCEL_OFF: 8, SPEC_NITRO: 10, SPEC_SPIKES: 11, SPEC_RED: 12 });
  });

  it('deployment Monad testnet terisi; null kalau alamat belum ada', () => {
    const live = getDeployment();
    expect(live?.chainId).toBe(10143);
    expect(live?.abi.CarNFT.length).toBeGreaterThan(0);
    expect(getDeployment({ chainId: null, explorerUrl: null, deployBlock: null, runRegistry: null, carNFT: null, abi: { RunRegistry: [], CarNFT: [] } })).toBeNull();
    const addr = '0x' + '11'.repeat(20);
    const d = getDeployment({ chainId: 1, explorerUrl: null, deployBlock: 5, runRegistry: addr, carNFT: addr, abi: { RunRegistry: [], CarNFT: [] } });
    expect(d?.runRegistry).toBe(addr);
  });
});
