import type { ChainEvent } from './ports';

type Listener = (e: ChainEvent) => void | Promise<void>;

/** Event bus bertipe dari indexer (atau mock) ke layanan backend. */
export class ChainBus {
  #listeners: Listener[] = [];
  #onError: (err: unknown, e: ChainEvent) => void;

  constructor(onError: (err: unknown, e: ChainEvent) => void = (err) => console.error(err)) {
    this.#onError = onError;
  }

  on(fn: Listener): () => void {
    this.#listeners.push(fn);
    return () => {
      this.#listeners = this.#listeners.filter((l) => l !== fn);
    };
  }

  /** Panggil semua listener secara berurutan. Error satu listener tidak menghentikan yang lain. */
  async emit(e: ChainEvent): Promise<void> {
    for (const fn of this.#listeners) {
      try {
        await fn(e);
      } catch (err) {
        this.#onError(err, e);
      }
    }
    // Satu batch relayer bisa membawa 60 mepet (±1–2 ms per event): beri giliran ke pesan WS pemain di antaranya
    // supaya event loop tidak terblok ±100 ms sekaligus.
    await new Promise<void>((r) => setImmediate(r));
  }
}
