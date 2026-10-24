// PRNG deterministik (TECH_SPEC §3.3): sfc32 dengan stream terpisah untuk lalu lintas dan NPC.
import { encodePacked, keccak256 } from 'viem';
import type { Hex } from './types';

export type Rng = {
  /** uint32 berikutnya. */
  next(): number;
  /** Integer di [min, max], inklusif. */
  int(min: number, max: number): number;
  /** true dengan peluang permille/1000. */
  chance(permille: number): boolean;
};

export function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return t >>> 0;
  };
}

/** Stream dari keccak256(seed ‖ label), dipecah menjadi 4 × uint32 big-endian. */
export function makeRng(seed: Hex, label: 'traffic' | 'npc'): Rng {
  const k = keccak256(encodePacked(['bytes32', 'string'], [seed, label]));
  const word = (i: number) => parseInt(k.slice(2 + i * 8, 10 + i * 8), 16);
  const next = sfc32(word(0), word(1), word(2), word(3));
  return {
    next,
    int: (min, max) => min + (next() % (max - min + 1)),
    chance: (permille) => next() % 1000 < permille,
  };
}

export const lerpInt = (a: number, b: number, x: number, X: number) => a + Math.floor(((b - a) * x) / X);
