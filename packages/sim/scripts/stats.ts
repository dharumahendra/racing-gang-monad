// Statistik balance: berapa mepet yang didapat autopilot per mobil dalam satu run.
//   pnpm --filter @racing-gang/sim stats -- --seeds 200
// Autopilot BUKAN manusia: angka ini batas atas kasar untuk pemain yang sangat baik, bukan rata-rata pemain.
import { parseArgs } from 'node:util';
import { keccak256, toHex } from 'viem';
import { CARS } from '@racing-gang/config';
import { playRun } from '../src/dev/index';

const { values: args } = parseArgs({ options: { seeds: { type: 'string', default: '200' } } });
const N = Number(args.seeds);

const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!;

console.log(`Autopilot, ${N} seed per mobil, NPC aktif, tanpa gangguan penonton\n`);
console.log('mobil   | mepet p10 / p50 / p90 / maks | lama run p50 | selesai 100 dtk | lulus tier berikut (syarat)');
for (const car of CARS) {
  const nm: number[] = [];
  const ticks: number[] = [];
  let timeUp = 0;
  for (let i = 0; i < N; i++) {
    const r = playRun({ runId: keccak256(toHex(`stats-run-${i}`)), seed: keccak256(toHex(`stats-seed-${i}`)), carTier: car.tier });
    nm.push(r.nearMisses);
    ticks.push(r.endTick);
    if (r.endReason === 'TIME_UP') timeUp++;
  }
  nm.sort((a, b) => a - b);
  ticks.sort((a, b) => a - b);
  const next = CARS.find((c) => c.tier > 0 && c.minCarTier === car.tier && c.tier === car.tier + 1);
  const pass = next ? `${((nm.filter((x) => x >= next.reqNearMiss).length / N) * 100).toFixed(0)}% (≥${next.reqNearMiss} untuk ${next.name})` : '-';
  console.log(
    `${car.name.padEnd(7)} | ${[10, 50, 90].map((p) => String(pct(nm, p)).padStart(3)).join(' / ')} / ${String(nm.at(-1)).padStart(3)}        | ` +
      `${(pct(ticks, 50) / 30).toFixed(0).padStart(4)} dtk     | ${((timeUp / N) * 100).toFixed(0).padStart(3)}%            | ${pass}`,
  );
}
