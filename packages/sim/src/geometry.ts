// Geometri kotak (TECH_SPEC §3.4): pemain x ± 90, z ± 225; kendaraan laneCenter ± w/2, zv ± l/2.
import { LANE_WIDTH, PLAYER_L, PLAYER_W } from '@racing-gang/config';

export const HALF_PW = PLAYER_W / 2;
export const HALF_PL = PLAYER_L / 2;

/** Rentang terbuka beririsan: aMin < bMax && bMin < aMax. */
export const overlap = (aMin: number, aMax: number, bMin: number, bMax: number) => aMin < bMax && bMin < aMax;

/** Kotak pemain beririsan dengan kotak berpusat (cx, cz) berukuran w × l. */
export const playerHits = (px: number, pz: number, cx: number, cz: number, w: number, l: number) =>
  overlap(px - HALF_PW, px + HALF_PW, cx - w / 2, cx + w / 2) && overlap(pz - HALF_PL, pz + HALF_PL, cz - l / 2, cz + l / 2);

/** Rentang lateral pemain beririsan dengan lajur `lane`: x ∈ [350*lane, 350*(lane+1)). */
export const playerInLane = (px: number, lane: number) =>
  overlap(px - HALF_PW, px + HALF_PW, LANE_WIDTH * lane, LANE_WIDTH * (lane + 1));
