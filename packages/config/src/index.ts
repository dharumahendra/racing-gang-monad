// Sumber kebenaran angka game (TECH_SPEC §2.2).
// Semua angka integer. Jarak dalam cm, kecepatan dalam cm/tick. 1 km/j ≈ 0,926 cm/tick.
// Kalau angka diubah, naikkan CONFIG_VERSION dan buat ulang golden fixture sim.

export const CONFIG_VERSION = 3;              // 2: setir tahan (posisi lateral bebas); 3: gas manual mulai 40 km/j + lalu lintas dari belakang

export const TICK_RATE = 30;                 // tick per detik
export const RUN_TICKS = 3000;               // 100 detik
export const COUNTDOWN_MS = 3000;

export const LANES = 4;
export const LANE_WIDTH = 350;               // lajur i: x ∈ [350*i, 350*(i+1)), lajur 0 = paling kiri
export const laneCenter = (i: number) => 175 + 350 * i;

/** Batas posisi lateral pemain: pusat lajur paling kiri sampai pusat lajur paling kanan. */
export const PLAYER_X_MIN = 175, PLAYER_X_MAX = 175 + 350 * (LANES - 1);

export const PLAYER_W = 180, PLAYER_L = 450;
export const VEHICLE = {
  CAR:   { code: 0, w: 180, l: 450,  coins: 100 },
  TRUCK: { code: 1, w: 250, l: 1000, coins: 200 },
} as const;

export const TRAFFIC_SPEED = 74;             // ≈ 80 km/j, seragam
export const PLAYER_START_SPEED = 37;        // ≈ 40 km/j, lebih lambat dari lalu lintas: tanpa gas, mobil dari belakang menyusul
export const PLAYER_START_LANE = 1;
export const MIN_SPEED = 37;                 // ≈ 40 km/j, batas bawah rem dan saat gas dilepas
export const BRAKE_DECEL = 2;                // cm/tick per tick selama ↓ ditahan
export const COAST = { decel: 1, everyTicks: 2 } as const; // gas dilepas: turun 1 cm/tick tiap 2 tick (±16 km/j per detik)

export const NEAR_MISS_MAX_GAP = 180;        // cm, tepi ke tepi
export const NEAR_MISS_MIN_SPEED = 93;       // ≈ 100 km/j

// Lalu lintas = dua aliran baris dari seed: ke depan mulai `firstRowS`, ke belakang mulai `firstBackRowS`.
// Baris dimunculkan saat masuk jendela spawn dan dihapus saat keluar jendela despawn (lebih lebar, supaya tidak berkedip).
export const TRAFFIC = {
  spawnAhead: 20000, despawnAhead: 22000, spawnBehind: 6000, despawnBehind: 7000,
  firstRowS: 3000, firstBackRowS: -6000, backIdBase: 2_000_000_000,
  gapStart: 2800, gapEnd: 1600, gapJitter: 800, rampS: 300000,
  twoLanePermilleStart: 150, twoLanePermilleEnd: 500,
  truckPermille: 200,
} as const;

export const WARN_TICKS = 60;                // aba-aba 2 detik
export const NITRO = { durationTicks: 90, speedNum: 3, speedDen: 2, accel: 6, decay: 3 } as const;
export const SPIKES = { aheadCm: 3000, w: 300, l: 300, slowTicks: 45 } as const;   // "rantai"
export const RED_ZONE_DURATIONS = [90, 150, 210] as const;                          // 3 / 5 / 7 detik
export const LIMITS = { maxNitro: 1, maxSpikes: 2, maxRedLanes: 2, minActivationGapTicks: 30 } as const;

export const NPC = {
  firstWarnTick: 300, intervalMin: 240, intervalMax: 360,
  nitroPermille: 350, spikesPermille: 400,     // sisanya (250) red zone
  twoLanePermille: 300,                        // peluang red zone NPC menutup 2 lajur bersebelahan
} as const;

// maxSpeed dalam cm/tick (dipakai sim); maxKmh = angka nominal untuk tampilan (160 km/j, lalu +30 per tier).
// 250 km/j tidak punya padanan integer persis (231 cm/tick ≈ 249,5 km/j), jadi tampilan memakai maxKmh.
export const CARS = [
  { tier: 0, name: 'Starter', maxSpeed: 148, maxKmh: 160, accel: 1, lateral: 30, reqNearMiss: 0,   minCarTier: 0, coinCost: 0,     priceMon: '0',    supply: 0 },
  { tier: 1, name: 'Tier 1',  maxSpeed: 176, maxKmh: 190, accel: 1, lateral: 32, reqNearMiss: 40,  minCarTier: 0, coinCost: 3000,  priceMon: '0.05', supply: 1000 },
  { tier: 2, name: 'Tier 2',  maxSpeed: 204, maxKmh: 220, accel: 1, lateral: 35, reqNearMiss: 75,  minCarTier: 1, coinCost: 10000, priceMon: '0.1',  supply: 300 },
  { tier: 3, name: 'Tier 3',  maxSpeed: 231, maxKmh: 250, accel: 2, lateral: 39, reqNearMiss: 110, minCarTier: 2, coinCost: 25000, priceMon: '0.25', supply: 100 },
  { tier: 4, name: 'Tier 4',  maxSpeed: 259, maxKmh: 280, accel: 2, lateral: 44, reqNearMiss: 150, minCarTier: 3, coinCost: 50000, priceMon: '0.5',  supply: 30 },
] as const;                                     // tier 0 bukan NFT; supply 0 = tak terbatas

export type Car = (typeof CARS)[number];
export const MAX_TIER = CARS.length - 1;

export const SPECTATOR = {
  energyMax: 100, regenPerSec: 10, maxPerRoom: 50, maxMsgPerSec: 10,
  cost: { NITRO: 30, SPIKES: 35, RED_3: 45, RED_5: 60, RED_7: 80 },
} as const;
export const ROOM = { codeLength: 6, ttlMs: 15 * 60 * 1000, alphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' } as const;
export const NET = { watermarkEveryMs: 100, snapshotHz: 10, disruptionLeadTicks: 15, offlineGraceMs: 30000, maxAheadTicks: 30 } as const;
export const ANTI = { maxRunsPerHour: 20 } as const;
export const CHAIN = { seedBlockLag: 3, maxBatchNearMiss: 60, batchIntervalMs: 400, voucherTtlSec: 600, maxRunBlockSpan: 750 } as const;

/** Biaya energi penonton untuk satu gangguan. */
export function disruptionCost(kind: 'NITRO' | 'SPIKES' | 'RED', durationIndex = 0): number {
  if (kind === 'NITRO') return SPECTATOR.cost.NITRO;
  if (kind === 'SPIKES') return SPECTATOR.cost.SPIKES;
  return [SPECTATOR.cost.RED_3, SPECTATOR.cost.RED_5, SPECTATOR.cost.RED_7][durationIndex] ?? SPECTATOR.cost.RED_7;
}

/** Konversi string MON desimal (mis. "0.05") ke wei tanpa float. */
export function monToWei(mon: string): bigint {
  if (!/^\d+(\.\d{1,18})?$/.test(mon)) throw new Error(`Format MON tidak valid: ${mon}`);
  const [whole = '0', frac = ''] = mon.split('.');
  return BigInt(whole) * 10n ** 18n + BigInt(frac.padEnd(18, '0'));
}

/** Parameter constructor kontrak, diekspor ke contract/config/cars.json oleh `pnpm config:export`. */
export function buildCarsJson() {
  return {
    configVersion: CONFIG_VERSION,
    reqNearMiss: CARS.map((c) => c.reqNearMiss),
    minCarTier: CARS.map((c) => c.minCarTier),
    coinCost: CARS.map((c) => c.coinCost),
    priceWei: CARS.map((c) => monToWei(c.priceMon).toString()),
    supply: CARS.map((c) => c.supply),
  };
}

/** km/j untuk HUD (cm/tick × 1,08). Hanya tampilan, jangan dipakai di sim. */
export const toKmh = (cmPerTick: number) => Math.round(cmPerTick * 1.08);

export * from './enums';
export * from './deployments';
