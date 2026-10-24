// Generator lalu lintas (TECH_SPEC §3.5). Murni dari seed, tidak bergantung pada pemain,
// sehingga penonton dan halaman audit bisa menghitung ulang lalu lintas yang sama.
import { LANES, TRAFFIC, VehicleType } from '@racing-gang/config';
import { lerpInt, makeRng } from './prng';
import type { Hex, Row } from './types';

const ALL_LANES = Array.from({ length: LANES }, (_, i) => i);

export function* trafficRows(seed: Hex): Generator<Row, never> {
  const rng = makeRng(seed, 'traffic');
  let s: number = TRAFFIC.firstRowS;
  let prevFree = ALL_LANES;
  for (let k = 0; ; k++) {
    const x = Math.min(s, TRAFFIC.rampS);
    const p2 = lerpInt(TRAFFIC.twoLanePermilleStart, TRAFFIC.twoLanePermilleEnd, x, TRAFFIC.rampS);
    const count = rng.chance(p2) ? 2 : 1;
    const first = rng.int(0, LANES - 1);
    const lanes = [first];
    if (count === 2) {
      let second = rng.int(0, LANES - 2);
      if (second >= first) second += 1;
      const free = ALL_LANES.filter((l) => l !== first && l !== second);
      // Dua baris berturutan harus punya minimal satu lajur bebas yang sama; kalau tidak, tetap 1 lajur.
      if (free.some((l) => prevFree.includes(l))) lanes.push(second);
    }
    // Jenis kendaraan diambil per slot, sesuai urutan `lanes` (BACKEND_PLAN D2).
    const vehicles = lanes.map((lane, slot) => ({
      id: k * 2 + slot,
      lane,
      type: rng.chance(TRAFFIC.truckPermille) ? VehicleType.TRUCK : VehicleType.CAR,
    }));
    yield { k, s, vehicles };
    prevFree = ALL_LANES.filter((l) => !lanes.includes(l));
    s += lerpInt(TRAFFIC.gapStart, TRAFFIC.gapEnd, x, TRAFFIC.rampS) + rng.int(0, TRAFFIC.gapJitter);
  }
}
