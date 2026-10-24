// Ekspor angka mobil untuk script deploy kontrak (TECH_SPEC §2.2, §6.4).
// Jalankan: pnpm config:export  →  contract/config/cars.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCarsJson } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../../contract/config/cars.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(buildCarsJson(), null, 2) + '\n');
console.log(`cars.json → ${out}`);
