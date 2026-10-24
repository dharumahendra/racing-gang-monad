import type { Address } from '@racing-gang/config/protocol';

export const NONCE_TTL_MS = 5 * 60 * 1000;

/** Nonce SIWE di memori: berlaku 5 menit dan sekali pakai. Server berjalan satu instance. */
export class NonceStore {
  #map = new Map<string, { address: Address; expiresAt: number }>();
  #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  put(nonce: string, address: Address) {
    this.#sweep();
    this.#map.set(nonce, { address, expiresAt: this.#now() + NONCE_TTL_MS });
  }

  /** Ambil dan hapus nonce. `null` kalau tidak ada atau kedaluwarsa. */
  take(nonce: string): { address: Address } | null {
    const e = this.#map.get(nonce);
    this.#map.delete(nonce);
    if (!e || e.expiresAt < this.#now()) return null;
    return { address: e.address };
  }

  #sweep() {
    const now = this.#now();
    for (const [k, v] of this.#map) if (v.expiresAt < now) this.#map.delete(k);
  }
}
