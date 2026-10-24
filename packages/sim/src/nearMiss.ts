// Algoritma mepet (TECH_SPEC §3.6), dievaluasi di langkah 11 setiap tick.
import { NEAR_MISS_MAX_GAP, NEAR_MISS_MIN_SPEED, laneCenter } from '@racing-gang/config';
import { HALF_PL, HALF_PW } from './geometry';

export type Track = { overlapSeen: boolean; minGap: number; resolved: boolean };

export const newTrack = (): Track => ({ overlapSeen: false, minGap: Number.MAX_SAFE_INTEGER, resolved: false });

/**
 * Perbarui status satu kendaraan. Mengembalikan true tepat pada tick kendaraan itu
 * selesai disalip dan memenuhi syarat mepet. Kendaraan yang sudah `resolved` diabaikan.
 */
export function updateTrack(
  t: Track,
  px: number,
  pz: number,
  speed: number,
  vLane: number,
  vz: number,
  w: number,
  l: number,
): boolean {
  if (t.resolved) return false;
  const pRear = pz - HALF_PL, pFront = pz + HALF_PL;
  const vRear = vz - l / 2, vFront = vz + l / 2;
  if (pFront > vRear && pRear < vFront) {
    const gap = Math.abs(px - laneCenter(vLane)) - (HALF_PW + w / 2);
    t.overlapSeen = true;
    t.minGap = Math.min(t.minGap, gap);
  }
  if (pRear > vFront) {
    t.resolved = true;
    return t.overlapSeen && t.minGap <= NEAR_MISS_MAX_GAP && speed >= NEAR_MISS_MIN_SPEED;
  }
  return false;
}
