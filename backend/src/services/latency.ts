// Latensi mepet terverifikasi → tercatat on-chain (PRD §11: median ≤ 2 dtk). Hanya untuk pemantauan.
const WINDOW = 200;

export class LatencyStats {
  #samples: number[] = [];
  #total = 0;

  add(ms: number) {
    this.#samples.push(ms);
    if (this.#samples.length > WINDOW) this.#samples.shift();
    this.#total++;
  }

  get total() {
    return this.#total;
  }

  /** Median dan p90 dari 200 sampel terakhir; null kalau belum ada. */
  summary(): { samples: number; medianMs: number; p90Ms: number } | null {
    if (this.#samples.length === 0) return null;
    const s = [...this.#samples].sort((a, b) => a - b);
    const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
    return { samples: s.length, medianMs: at(0.5), p90Ms: at(0.9) };
  }
}
