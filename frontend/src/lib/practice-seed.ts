// Seed acak untuk Practice. Hanya dipakai di latihan lokal: run online/chain tetap memakai
// seed otoritatif dari backend/chain. Format bytes32 hex sesuai yang divalidasi shared Sim.
import type { Hex } from '@racing-gang/config/protocol';

/** 32 byte acak dari CSPRNG browser, diformat jadi bytes32 hex (0x + 64 hex). */
export function randomSeed(rng: Pick<Crypto, 'getRandomValues'> = crypto): Hex {
  const bytes = rng.getRandomValues(new Uint8Array(32));
  let hex = '0x';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex as Hex;
}
