// Jadwal gangguan NPC dari seed (TECH_SPEC §3.7). Selalu aktif, sama untuk semua pemain dengan seed yang sama.
import { LANES, NPC, type DisruptionKind, type DurationIndex } from '@racing-gang/config';
import { makeRng, type Rng } from './prng';
import type { Hex } from './types';

export type NpcDraw = { id: string; kind: DisruptionKind; lanes: number[]; durationIndex?: DurationIndex };

export class NpcScheduler {
  #rng: Rng;
  #k = 0;
  nextWarnTick: number = NPC.firstWarnTick;

  constructor(seed: Hex) {
    this.#rng = makeRng(seed, 'npc');
  }

  /**
   * Ambil gangguan NPC berikutnya dan majukan `nextWarnTick`. Semua angka selalu diambil
   * dalam urutan r, lane, two, durIdx, interval, walaupun gangguannya nanti dibatalkan,
   * supaya stream tetap sejajar.
   */
  draw(): NpcDraw {
    const rng = this.#rng;
    const r = rng.int(0, 999);
    const lane = rng.int(0, LANES - 1);
    const two = rng.chance(NPC.twoLanePermille);
    const durationIndex = rng.int(0, 2) as DurationIndex;
    const interval = rng.int(NPC.intervalMin, NPC.intervalMax);

    const id = `n${this.#k++}`;
    this.nextWarnTick += interval;

    if (r < NPC.nitroPermille) return { id, kind: 'NITRO', lanes: [] };
    if (r < NPC.nitroPermille + NPC.spikesPermille) return { id, kind: 'SPIKES', lanes: [lane] };
    const base = Math.min(lane, LANES - 2);
    return { id, kind: 'RED', lanes: two ? [base, base + 1] : [lane], durationIndex };
  }
}
