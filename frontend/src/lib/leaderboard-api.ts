// Adapter leaderboard publik (GET /leaderboard). Tanpa login. Baca-saja: skor di sini belum tentu
// berarti seluruh pencatatannya final on-chain, jadi UI tidak boleh melabelinya melebihi datanya.
import { CARS, RUN_TICKS } from '@racing-gang/config';
import type { LeaderboardResponse } from '@racing-gang/config/protocol';
import { ApiError } from './api';
import { hex32, uint } from './room-api';

const address = (value: unknown): value is `0x${string}` => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value);

type Entry = LeaderboardResponse['entries'][number];
const validEntry = (row: any): row is Entry =>
  row && hex32(row.runId) && address(row.player) && uint(row.carTier, CARS.length - 1) && uint(row.nearMisses, RUN_TICKS) && uint(row.endedAt);

function valid(body: any, limit: number): body is LeaderboardResponse {
  return body && Array.isArray(body.entries) && body.entries.length <= limit && body.entries.every(validEntry);
}

export function createLeaderboardApi(baseUrl: string, fetcher: typeof fetch = fetch) {
  const endpoint = baseUrl.replace(/\/$/, '');
  return {
    async read(limit = 20, signal?: AbortSignal): Promise<LeaderboardResponse> {
      const n = Math.min(100, Math.max(1, Math.trunc(limit)));
      if (!endpoint) throw new ApiError('Leaderboard service is not configured.', 'NOT_CONFIGURED');
      let response: Response;
      try {
        response = await fetcher(`${endpoint}/leaderboard?limit=${n}`, {
          headers: { Accept: 'application/json' },
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        throw new ApiError('Could not load the leaderboard. Check your connection.', 'NETWORK');
      }
      if (!response.ok) throw new ApiError('Server could not provide the leaderboard.', response.status === 404 ? 'NOT_FOUND' : 'API_ERROR');
      const body = await response.json().catch(() => null);
      if (!valid(body, n)) throw new ApiError('Leaderboard response does not match the protocol.', 'INVALID_RESPONSE');
      return body;
    },
  };
}

/** Alamat singkat untuk tampilan ranking, mis. 0x1234…abcd. */
export const shortAddress = (a: string): string => (/^0x[\da-f]{40}$/i.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
