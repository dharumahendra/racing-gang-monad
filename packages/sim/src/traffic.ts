// Generator lalu lintas (TECH_SPEC §3.5). Murni dari seed, tidak bergantung pada pemain,
// sehingga penonton dan halaman audit bisa menghitung ulang lalu lintas yang sama.
// Dua aliran: ke depan (s naik dari firstRowS) dan ke belakang (s turun dari firstBackRowS). Aliran belakang
// baru terlihat kalau pemain lebih lambat dari lalu lintas, lalu menyusul dari belakang (CONFIG_VERSION 3).
import { LANES, TRAFFIC, VehicleType } from '@racing-gang/config';
import { lerpInt, makeRng } from './prng';
import type { Hex, Row } from './types';

const ALL_LANES = Array.from({ length: LANES }, (_, i) => i);

/** Baris ke depan: k = 0, 1, 2, …; id kendaraan k*2+slot. */
export const trafficRows = (seed: Hex) => rows(seed, 'traffic', TRAFFIC.firstRowS, 1, 0);

/** Baris ke belakang: k = -1, -2, …; id kendaraan backIdBase + j*2+slot (j = -1-k) supaya tetap uint32. */
export const trafficRowsBack = (seed: Hex) => rows(seed, 'traffic-back', TRAFFIC.firstBackRowS, -1, TRAFFIC.backIdBase);

function* rows(seed: Hex, label: 'traffic' | 'traffic-back', firstS: number, dir: 1 | -1, idBase: number): Generator<Row, never> {
  const rng = makeRng(seed, label);
  let s: number = firstS;
  let prevFree = ALL_LANES;
  for (let j = 0; ; j++) {
    // Kepadatan naik seiring jarak tempuh ke depan; aliran belakang (s < 0) tetap di kepadatan awal.
    const x = Math.max(0, Math.min(s, TRAFFIC.rampS));
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
      id: idBase + j * 2 + slot,
      lane,
      type: rng.chance(TRAFFIC.truckPermille) ? VehicleType.TRUCK : VehicleType.CAR,
    }));
    yield { k: dir === 1 ? j : -1 - j, s, vehicles };
    prevFree = ALL_LANES.filter((l) => !lanes.includes(l));
    s += dir * (lerpInt(TRAFFIC.gapStart, TRAFFIC.gapEnd, x, TRAFFIC.rampS) + rng.int(0, TRAFFIC.gapJitter));
  }
}
