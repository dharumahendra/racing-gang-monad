// Ekspor angka mobil untuk script deploy kontrak (TECH_SPEC §2.2, §6.4).
// Jalankan: pnpm config:export  →  contract/config/cars.json dan contract/config/collectibles.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCarsJson, buildCollectiblesJson } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../../contract/config/cars.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(buildCarsJson(), null, 2) + '\n');
console.log(`cars.json → ${out}`);

const outCollectibles = resolve(here, '../../../contract/config/collectibles.json');
writeFileSync(outCollectibles, JSON.stringify(buildCollectiblesJson(), null, 2) + '\n');
console.log(`collectibles.json → ${outCollectibles}`);
