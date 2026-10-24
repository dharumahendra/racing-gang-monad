import { describe, expect, it, vi } from 'vitest';
import { createLeaderboardApi, shortAddress } from './leaderboard-api';

const PLAYER = `0x${'ab'.repeat(20)}` as const;
const RUN = `0x${'12'.repeat(32)}` as const;
const entry = (over: Record<string, unknown> = {}) => ({ runId: RUN, player: PLAYER, carTier: 1, nearMisses: 42, endedAt: 1_700_000_000, ...over });
const ok = (body: unknown) => async () => Response.json(body);

describe('createLeaderboardApi', () => {
  it('membaca entries yang valid dan mengirim limit ke query', async () => {
    const fetcher = vi.fn<typeof fetch>(ok({ entries: [entry()] }));
    const data = await createLeaderboardApi('https://game.test', fetcher).read(20);
    expect(data.entries).toHaveLength(1);
    expect(fetcher.mock.calls[0][0]).toBe('https://game.test/leaderboard?limit=20');
  });

  it('membatasi limit ke rentang 1..100', async () => {
    const fetcher = vi.fn<typeof fetch>(ok({ entries: [] }));
    const api = createLeaderboardApi('https://game.test', fetcher);
    await api.read(0);
    await api.read(9999);
    expect(fetcher.mock.calls[0][0]).toContain('limit=1');
    expect(fetcher.mock.calls[1][0]).toContain('limit=100');
  });

  it('menerima daftar kosong tanpa error', async () => {
    const data = await createLeaderboardApi('https://game.test', ok({ entries: [] }) as unknown as typeof fetch).read();
    expect(data.entries).toEqual([]);
  });

  it('menolak respons yang tidak sesuai protokol', async () => {
    for (const body of [
      null,
      { entries: 'x' },
      { entries: [entry({ player: '0x123' })] },
      { entries: [entry({ runId: 'nope' })] },
      { entries: [entry({ carTier: 9 })] },
      { entries: [entry({ nearMisses: -1 })] },
      { entries: [entry({ nearMisses: 3001 })] },
      { entries: [entry({ endedAt: 1.5 })] },
    ]) {
      await expect(
        createLeaderboardApi('https://game.test', ok(body) as unknown as typeof fetch).read(),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });

  it('menolak lebih banyak entri daripada limit yang diminta', async () => {
    const body = { entries: [entry(), entry({ runId: `0x${'34'.repeat(32)}` })] };
    await expect(
      createLeaderboardApi('https://game.test', ok(body) as unknown as typeof fetch).read(1),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('melaporkan error jaringan tanpa menelan AbortError', async () => {
    await expect(
      createLeaderboardApi('https://game.test', (async () => { throw new TypeError('boom'); }) as unknown as typeof fetch).read(),
    ).rejects.toMatchObject({ code: 'NETWORK' });
    const abort = new DOMException('aborted', 'AbortError');
    await expect(
      createLeaderboardApi('https://game.test', (async () => { throw abort; }) as unknown as typeof fetch).read(),
    ).rejects.toBe(abort);
  });

  it('gagal cepat tanpa baseUrl (tidak mengarang data)', async () => {
    const fetcher = vi.fn();
    await expect(createLeaderboardApi('', fetcher as unknown as typeof fetch).read()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('shortAddress', () => {
  it('memendekkan alamat valid dan membiarkan nilai lain apa adanya', () => {
    expect(shortAddress(PLAYER)).toBe('0xabab…abab');
    expect(shortAddress('bukan-alamat')).toBe('bukan-alamat');
  });
});
