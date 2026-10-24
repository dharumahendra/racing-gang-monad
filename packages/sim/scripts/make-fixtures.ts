// Buat ulang golden fixture: pnpm --filter @racing-gang/sim fixtures
// Jalankan ulang setiap kali CONFIG_VERSION atau logika sim berubah, lalu review diff-nya.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keccak256, toHex } from 'viem';
import { EntryKind, encodeRedData } from '@racing-gang/config';
import { playRun } from '../src/dev/index';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../fixtures');
mkdirSync(outDir, { recursive: true });

const id = (label: string) => keccak256(toHex(label));

// Gangguan penonton terjadwal untuk fixture 3, termasuk dua entri di tick yang sama dan satu data tidak valid.
const SPEC: Record<number, { kind: number; data: number }[]> = {
  120: [{ kind: EntryKind.SPEC_NITRO, data: 0 }],
  400: [{ kind: EntryKind.SPEC_SPIKES, data: 2 }],
  700: [{ kind: EntryKind.SPEC_RED, data: encodeRedData(3, 1) }, { kind: EntryKind.SPEC_SPIKES, data: 0 }],
  760: [{ kind: EntryKind.SPEC_RED, data: encodeRedData(9, 0) }],
  1000: [{ kind: EntryKind.SPEC_RED, data: encodeRedData(0, 2) }],
};

const cases = [
  { name: 'golden-1', runId: id('golden-run-1'), seed: id('golden-seed-1'), carTier: 0 },
  { name: 'golden-2', runId: id('golden-run-2'), seed: id('golden-seed-2'), carTier: 2 },
  { name: 'golden-3', runId: id('golden-run-3'), seed: id('golden-seed-3'), carTier: 1, spec: (t: number) => SPEC[t] ?? [] },
];

for (const c of cases) {
  const r = playRun({ runId: c.runId, seed: c.seed, carTier: c.carTier, spec: c.spec });
  const fixture = {
    name: c.name,
    runId: r.runId,
    seed: r.seed,
    carTier: r.carTier,
    configVersion: r.configVersion,
    entries: r.entries,
    expected: {
      endTick: r.endTick,
      endReason: r.endReason,
      nearMisses: r.nearMisses,
      finalHash: r.finalHash,
      events: r.events,
    },
  };
  writeFileSync(resolve(outDir, `${c.name}.json`), JSON.stringify(fixture, null, 1) + '\n');
  console.log(`${c.name}: ${r.endReason} @${r.endTick}, ${r.nearMisses} mepet, ${r.entries.length} entri, ${r.events.length} event`);
}
