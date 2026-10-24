// Golden test: log tetap → event identik. Fixture yang sama dipakai halaman /dev/golden di browser.
// Kalau gagal karena perubahan logika yang disengaja: jalankan `pnpm --filter @racing-gang/sim fixtures`,
// review diff-nya, dan umumkan ke tim.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG_VERSION } from '@racing-gang/config';
import { replay } from '../src/replay';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

describe('golden fixture', () => {
  it('ada fixture', () => expect(files.length).toBeGreaterThanOrEqual(3));

  for (const f of files) {
    it(f, () => {
      const fx = JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
      expect(fx.configVersion).toBe(CONFIG_VERSION);
      const r = replay({ runId: fx.runId, seed: fx.seed, carTier: fx.carTier, entries: fx.entries });
      expect(r.endTick).toBe(fx.expected.endTick);
      expect(r.endReason).toBe(fx.expected.endReason);
      expect(r.nearMisses).toBe(fx.expected.nearMisses);
      expect(r.finalHash).toBe(fx.expected.finalHash);
      expect(JSON.parse(JSON.stringify(r.events))).toEqual(fx.expected.events);
    });
  }
});
