import { describe, expect, it } from 'vitest';
import { CARS, CONFIG_VERSION } from '@racing-gang/config';
import type { PlayC2S } from '@racing-gang/config/protocol';
import { Sim } from '@racing-gang/sim';

describe('workspace', () => {
  it('backend bisa meng-import config, protocol, dan sim', () => {
    expect(CONFIG_VERSION).toBe(1);
    expect(CARS).toHaveLength(5);
    const msg: PlayC2S = { t: 'watermark', tick: 0 };
    expect(msg.t).toBe('watermark');
    const sim = new Sim({ runId: `0x${'01'.repeat(32)}`, seed: `0x${'02'.repeat(32)}`, carTier: 0 });
    sim.step([]);
    expect(sim.tick).toBe(1);
  });
});
