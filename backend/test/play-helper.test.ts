import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { waitFor } from './play';

describe('waitFor batas waktu nyata', () => {
  it('menunggu kondisi async meskipun event loop berputar cepat', async () => {
    let ready = false;
    const timer = setTimeout(() => { ready = true; }, 50);
    try {
      await waitFor(() => ready, 'event tertunda', 500);
      expect(ready).toBe(true);
    } finally {
      clearTimeout(timer);
    }
  });

  it('tetap gagal setelah deadline bila kondisi tidak pernah terpenuhi', async () => {
    const start = performance.now();
    await expect(waitFor(() => false, 'event tidak datang', 20)).rejects.toThrow('Timeout menunggu event tidak datang');
    expect(performance.now() - start).toBeGreaterThanOrEqual(20);
  });
});
