import { describe, expect, it } from 'vitest';
import { Sim } from '@racing-gang/sim';
import { randomSeed } from './practice-seed';

const RUN_ID = `0x${'11'.repeat(32)}` as const;
const isHex32 = (h: string) => /^0x[0-9a-fA-F]{64}$/.test(h);

describe('randomSeed', () => {
  it('menghasilkan bytes32 hex yang diterima Sim', () => {
    const seed = randomSeed();
    expect(isHex32(seed)).toBe(true);
    // Sim melempar kalau seed bukan bytes32 hex; konstruksi tanpa error = diterima.
    expect(() => new Sim({ runId: RUN_ID, seed, carTier: 0 })).not.toThrow();
  });

  it('memformat byte menjadi hex yang benar (tidak memotong nol di depan)', () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, i) => i); // 00,01,...,1f
    const seed = randomSeed({ getRandomValues: (() => bytes) as Crypto['getRandomValues'] });
    expect(seed).toBe('0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
  });

  it('memberi seed berbeda pada panggilan berurutan (bukan nilai tetap)', () => {
    const seeds = new Set(Array.from({ length: 16 }, () => randomSeed()));
    expect(seeds.size).toBe(16);
  });
});
