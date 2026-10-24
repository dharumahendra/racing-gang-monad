// Pemain otomatis sederhana untuk test, golden fixture, dan bot backend.
// BUKAN bagian logika game: hanya membaca SimView dan menghasilkan input seperti pemain manusia.
import { CARS, EntryKind, LANES, TRAFFIC_SPEED, laneCenter, type PlayerInputKind } from '@racing-gang/config';
import type { SimView } from '../types';

export type AutopilotOptions = {
  /** Jangan pernah mengerem. */
  noBrake?: boolean;
  /** Abaikan red zone (untuk test kegagalan red zone). */
  ignoreRed?: boolean;
  /** Abaikan rantai (untuk test rantai). */
  ignoreSpikes?: boolean;
  /** Hanya pindah lajur kalau lajur sekarang berbahaya; tidak memburu mepet. */
  stay?: boolean;
};

const HALF_PL = 225;
const MARGIN = 120;
const HOLD_TICKS = 14;

export class Autopilot {
  #braking = false;
  /** Lajur tujuan selama setir ditahan. */
  #goal = 0;
  readonly #opts: AutopilotOptions;

  constructor(opts: AutopilotOptions = {}) {
    this.#opts = opts;
  }

  /** Input untuk tick berikutnya, berdasarkan state setelah tick sekarang. */
  decide(view: SimView, carTier: number): PlayerInputKind[] {
    const p = view.player;
    const lateral = CARS[carTier]!.lateral;
    // Setir ditahan sampai pusat mobil kurang dari lateral/2 sebelum pusat lajur tujuan (atau sudah lewat), lalu
    // dilepas. Kalau beberapa tick lewat sekaligus (frontend), mobil bisa kebablasan; itu dikoreksi di bawah.
    if (p.steer !== 0 && (laneCenter(this.#goal) - p.x) * p.steer * 2 <= lateral) {
      return [p.steer < 0 ? EntryKind.LEFT_OFF : EntryKind.RIGHT_OFF];
    }
    const settled = p.steer === 0;
    const cur = settled ? p.targetLane : this.#goal;
    if (settled && Math.abs(p.x - laneCenter(cur)) * 2 > lateral) {
      this.#goal = cur;
      return [p.x > laneCenter(cur) ? EntryKind.LEFT : EntryKind.RIGHT];
    }
    const rel = Math.max(1, p.speed - TRAFFIC_SPEED);
    const tc = Math.ceil(350 / lateral);

    // Lajur aman selama `ticks` ke depan: tidak ada kendaraan yang akan tersusul dalam waktu itu.
    const clearFor = (lane: number, ticks: number) =>
      view.vehicles.every((v) => {
        if (v.lane !== lane) return true;
        if (v.z + v.l / 2 < p.z - HALF_PL - 40) return true; // sudah di belakang
        return v.z - v.l / 2 - (p.z + HALF_PL) > rel * ticks + MARGIN;
      });
    const red = (lane: number) => !this.#opts.ignoreRed && view.redLanes.some((r) => r.lane === lane);
    const spikesAhead = (lane: number) => view.spikes.some((s) => s.lane === lane && !s.hit && s.z > p.z - HALF_PL);
    const pathOk = (to: number) => {
      const dir = Math.sign(to - cur);
      for (let k = cur + dir, j = 1; k !== to; k += dir, j++) if (red(k) || !clearFor(k, (j + 1) * tc + 2)) return false;
      return !red(to) && clearFor(to, Math.abs(to - cur) * tc + HOLD_TICKS);
    };
    const targets = (lane: number) =>
      view.vehicles.filter((v) => Math.abs(v.lane - lane) === 1 && v.z + v.l / 2 > p.z && v.z - v.l / 2 < p.z + 5000).length;

    let best = cur;
    let anyOk = true;
    if (settled) {
      let bestScore = -Infinity;
      for (let lane = 0; lane < LANES; lane++) {
        if (!pathOk(lane)) continue;
        if (this.#opts.stay && lane !== cur && pathOk(cur)) continue;
        let score = (this.#opts.stay ? 0 : targets(lane)) - Math.abs(lane - cur) * 0.3;
        if (lane === cur) score += 0.5;
        if (lane === 1 || lane === 2) score += 0.8; // lajur tengah punya dua jalan keluar
        if (!this.#opts.ignoreSpikes && spikesAhead(lane)) score -= 5;
        if (score > bestScore) { bestScore = score; best = lane; }
      }
      anyOk = bestScore > -Infinity;
    } else {
      anyOk = clearFor(cur, HOLD_TICKS);
    }

    const out: PlayerInputKind[] = [];
    if (best !== cur) {
      this.#goal = best;
      out.push(best < cur ? EntryKind.LEFT : EntryKind.RIGHT);
    }
    return this.#withBrake(out, anyOk);
  }

  #withBrake(out: PlayerInputKind[], anyOk: boolean): PlayerInputKind[] {
    const wantBrake = !this.#opts.noBrake && !anyOk;
    if (wantBrake !== this.#braking) {
      this.#braking = wantBrake;
      out.push(wantBrake ? EntryKind.BRAKE_ON : EntryKind.BRAKE_OFF);
    }
    return out;
  }
}
