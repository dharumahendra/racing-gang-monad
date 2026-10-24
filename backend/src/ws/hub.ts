// Registri koneksi WebSocket: satu koneksi /ws/play per pemain, dan sekumpulan penonton per room.
import type { WebSocket } from 'ws';
import type { Address } from '@racing-gang/config/protocol';

const OPEN = 1;

export class Hub {
  #players = new Map<Address, WebSocket>();
  #rooms = new Map<string, Set<WebSocket>>();

  /** Pasang koneksi pemain. Koneksi lama (tab lain) ditutup. */
  attachPlayer(address: Address, ws: WebSocket) {
    const old = this.#players.get(address);
    if (old && old !== ws) old.close(4000, 'Digantikan koneksi baru');
    this.#players.set(address, ws);
  }

  detachPlayer(address: Address, ws: WebSocket) {
    if (this.#players.get(address) === ws) this.#players.delete(address);
  }

  isPlayerOnline(address: Address) {
    return this.#players.get(address)?.readyState === OPEN;
  }

  toPlayer(address: Address, msg: object) {
    send(this.#players.get(address), msg);
  }

  joinRoom(code: string, ws: WebSocket) {
    const set = this.#rooms.get(code) ?? new Set();
    set.add(ws);
    this.#rooms.set(code, set);
  }

  leaveRoom(code: string, ws: WebSocket) {
    const set = this.#rooms.get(code);
    set?.delete(ws);
    if (set?.size === 0) this.#rooms.delete(code);
  }

  /** Jumlah koneksi pemain dan room yang terdaftar (cek kebocoran memori, /health). */
  stats() {
    return { players: this.#players.size, rooms: this.#rooms.size };
  }

  roomSize(code: string) {
    return this.#rooms.get(code)?.size ?? 0;
  }

  toRoom(code: string | null | undefined, msg: object) {
    if (!code) return;
    const data = JSON.stringify(msg);
    for (const ws of this.#rooms.get(code) ?? []) if (ws.readyState === OPEN) ws.send(data);
  }
}

export function send(ws: WebSocket | undefined, msg: object) {
  if (ws && ws.readyState === OPEN) ws.send(JSON.stringify(msg));
}
