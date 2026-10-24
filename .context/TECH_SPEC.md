# TECH SPEC — Racing Gang

**Versi:** Draft 1.2 · 21 Oktober 2026 · pasangan dari `PRD.md`
**Pemilik bagian:** §3 Dharu · §4–5 Dharu · §6 Bayu · §7.3–7.5 Bayu · §8 Raka

> Aturan emas: **semua logika game hanya ada di `packages/sim`**, dan paket yang sama dipakai oleh frontend, backend, dan halaman audit. Jangan pernah menulis ulang logika game di tempat lain.

---

## 1. Arsitektur

```
 ┌──────────── Browser pemain (laptop) ────────────┐        ┌──── Browser penonton (HP) ────┐
 │ frontend  ·  packages/sim (render + prediksi)    │        │ frontend /watch               │
 │ wallet (wagmi/viem)                               │        │ tanpa wallet                  │
 └───────┬──────────────────────────┬───────────────┘        └──────────────┬────────────────┘
         │ WS /ws/play (input,        │ tx buy() + MON                       │ WS /ws/watch
         │ watermark, ack, snapshot)  │                                      │ (disrupt)
         ▼                            │                                      ▼
 ┌──────────────────────── backend (Node) ─────────────────────────────────────────────────┐
 │ auth SIWE · runs · rooms · verifikasi (packages/sim) · ledger koin · voucher EIP-712     │
 │ chain/relayer (1 tx per blok) · chain/indexer (event → DB → WS)                          │
 └───────┬───────────────────────────────────────────────────────────────┬─────────────────┘
         │ submitBatch() (attester)                                       │ eth_subscribe logs
         ▼                                                                │
 ┌──────────────────────── Monad testnet ──────────────────────────────────────────────────┐
 │ RunRegistry: run, mepet, kelulusan          CarNFT: ERC-721 soulbound, buy() + voucher    │
 └─────────────────────────────────────────────────────────────────────────────────────────┘
```

Alur utama:
1. Pemain login dengan SIWE, lalu `POST /runs` → backend memilih `seedBlock`, menghitung `seed`, dan memasukkan `RunStart` ke antrean relayer.
2. Browser menjalankan `packages/sim` secara lokal dan mengirim input (bertanda tick) ke backend lewat WS.
3. Backend menjalankan `packages/sim` yang sama. Setiap event `NEAR_MISS` masuk ke antrean relayer.
4. Relayer mengirim `RunRegistry.submitBatch()` sekitar sekali per blok. Kontrak menyimpan hitungan dan menandai kelulusan (`Qualified`).
5. Indexer membaca event: `NearMiss` → kredit koin dan kirim `nearMiss.recorded` ke browser; `Qualified` → disimpan di DB **sebagai cache** untuk tampilan garasi (sumber kebenarannya tetap kontrak); `Purchased` → potong koin.
6. Beli mobil: `POST /vouchers` → backend menyisihkan koin dan menandatangani voucher → browser memanggil `CarNFT.buy(voucher, sig)` dengan `value` = harga MON.

## 2. Repo, stack, dan konfigurasi

### 2.1 Struktur monorepo (pnpm workspaces)

```
/frontend          React + Vite + TypeScript, three.js (react-three-fiber), wagmi v2 + viem, zustand   (Raka)
/backend           Node 20 + TypeScript, Fastify + @fastify/websocket, Drizzle + SQLite, viem           (Dharu)
/backend/src/chain relayer, indexer, voucher signer                                                     (Bayu)
/packages/sim      logika game deterministik + hash log + PRNG                                           (Dharu)
/packages/config   konstanta game, ABI, alamat deployment                                                (bersama)
/contract          Foundry + OpenZeppelin v5 (bukan workspace pnpm)                                      (Bayu)
/                  PRD.md, TECH_SPEC.md, TASKS.md, BACKEND_PLAN.md
```

`pnpm-workspace.yaml` berisi `packages/*`, `backend`, dan `frontend`. Paket `config` dan `sim` diekspor sebagai source TypeScript, jadi tidak perlu build step.

### 2.2 `packages/config` — sumber kebenaran angka

Semua angka memakai **integer**. Satuan jarak **cm**, satuan kecepatan **cm/tick**. 1 km/j ≈ 0,926 cm/tick.

```ts
export const CONFIG_VERSION = 1;

export const TICK_RATE = 30;                 // tick per detik
export const RUN_TICKS = 3000;               // 100 detik
export const COUNTDOWN_MS = 3000;

export const LANES = 4;
export const LANE_WIDTH = 350;               // lajur i: x ∈ [350*i, 350*(i+1)), lajur 0 = paling kiri
export const laneCenter = (i: number) => 175 + 350 * i;

export const PLAYER_W = 180, PLAYER_L = 450;
export const VEHICLE = {
  CAR:   { code: 0, w: 180, l: 450,  coins: 100 },
  TRUCK: { code: 1, w: 250, l: 1000, coins: 200 },
} as const;

export const TRAFFIC_SPEED = 74;             // ≈ 80 km/j, seragam
export const PLAYER_START_SPEED = 93;        // ≈ 100 km/j
export const PLAYER_START_LANE = 1;
export const MIN_SPEED = 80;                 // ≈ 86 km/j, selalu > TRAFFIC_SPEED
export const BRAKE_DECEL = 4;                // cm/tick per tick

export const NEAR_MISS_MAX_GAP = 180;        // cm, tepi ke tepi
export const NEAR_MISS_MIN_SPEED = 93;       // ≈ 100 km/j

export const TRAFFIC = {
  spawnAhead: 20000, despawnBehind: 2000, firstRowS: 3000,
  gapStart: 2800, gapEnd: 1600, gapJitter: 800, rampS: 300000,
  twoLanePermilleStart: 150, twoLanePermilleEnd: 500,
  truckPermille: 200,
};

export const WARN_TICKS = 60;                // aba-aba 2 detik
export const NITRO = { durationTicks: 90, speedNum: 3, speedDen: 2, accel: 6, decay: 3 };
export const SPIKES = { aheadCm: 3000, w: 300, l: 300, slowTicks: 45 };   // "rantai"
export const RED_ZONE_DURATIONS = [90, 150, 210] as const;                // 3 / 5 / 7 detik
export const LIMITS = { maxNitro: 1, maxSpikes: 2, maxRedLanes: 2, minActivationGapTicks: 30 };

export const NPC = {
  firstWarnTick: 300, intervalMin: 240, intervalMax: 360,
  nitroPermille: 350, spikesPermille: 400,     // sisanya (250) red zone
  twoLanePermille: 300,                        // peluang red zone NPC menutup 2 lajur bersebelahan
};

export const CARS = [
  { tier: 0, name: 'Starter', maxSpeed: 167, accel: 1, lateral: 30, reqNearMiss: 0,   minCarTier: 0, coinCost: 0,     priceMon: '0',    supply: 0 },
  { tier: 1, name: 'Tier 1',  maxSpeed: 185, accel: 1, lateral: 32, reqNearMiss: 40,  minCarTier: 0, coinCost: 3000,  priceMon: '0.05', supply: 1000 },
  { tier: 2, name: 'Tier 2',  maxSpeed: 204, accel: 1, lateral: 35, reqNearMiss: 75,  minCarTier: 1, coinCost: 10000, priceMon: '0.1',  supply: 300 },
  { tier: 3, name: 'Tier 3',  maxSpeed: 227, accel: 2, lateral: 39, reqNearMiss: 110, minCarTier: 2, coinCost: 25000, priceMon: '0.25', supply: 100 },
  { tier: 4, name: 'Tier 4',  maxSpeed: 250, accel: 2, lateral: 44, reqNearMiss: 150, minCarTier: 3, coinCost: 50000, priceMon: '0.5',  supply: 30 },
] as const;                                     // tier 0 bukan NFT; supply 0 = tak terbatas

export const SPECTATOR = {
  energyMax: 100, regenPerSec: 10, maxPerRoom: 50, maxMsgPerSec: 10,
  cost: { NITRO: 30, SPIKES: 35, RED_3: 45, RED_5: 60, RED_7: 80 },
};
export const ROOM = { codeLength: 6, ttlMs: 15 * 60 * 1000, alphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' };
export const NET = { watermarkEveryMs: 100, snapshotHz: 10, disruptionLeadTicks: 15, offlineGraceMs: 30000, maxAheadTicks: 30 };
export const ANTI = { maxRunsPerHour: 20 };
export const CHAIN = { seedBlockLag: 3, maxBatchNearMiss: 60, batchIntervalMs: 400, voucherTtlSec: 600, maxRunBlockSpan: 750 };
```

Deploy script kontrak membaca `CARS` dari file JSON hasil ekspor paket ini, sehingga angka di kontrak dan di game selalu sama.

## 3. Simulasi deterministik (`packages/sim`)

### 3.1 Prinsip

- **Integer saja.** Tanpa `Math.random`, tanpa float di logika, tanpa `Date.now`. Pembagian memakai `Math.floor` secara eksplisit.
- Langkah tetap 30 tick per detik. Render (60 fps) hanya menginterpolasi state, tidak mengubahnya.
- Fungsi murni: hasil hanya bergantung pada `seed`, `carTier`, `CONFIG_VERSION`, dan log entri.
- Wajib ada **golden test**: seed dan log tetap harus menghasilkan daftar event yang persis sama di Node dan di browser.

### 3.2 API

```ts
type LogEntry = { tick: number; kind: EntryKind; data: number; seq: number };
enum EntryKind { LEFT = 1, RIGHT = 2, BRAKE_ON = 3, BRAKE_OFF = 4, SPEC_NITRO = 10, SPEC_SPIKES = 11, SPEC_RED = 12 }
// SPEC_SPIKES.data = lane;  SPEC_RED.data = lane | (durationIndex << 8)   (durationIndex 0/1/2 = 3/5/7 dtk)

type SimEvent =
  | { type: 'NEAR_MISS'; tick: number; index: number; vehicleId: number; vehicleType: 0 | 1; coins: number; inputHash: Hex }
  | { type: 'CRASH'; tick: number; vehicleId: number }
  | { type: 'RED_ZONE_FAIL'; tick: number; lane: number }
  | { type: 'TIME_UP'; tick: number }
  | { type: 'SPIKES_HIT'; tick: number }
  | { type: 'DISRUPTION_WARN' | 'DISRUPTION_ACTIVE' | 'DISRUPTION_END' | 'DISRUPTION_DROPPED'; tick: number; d: Disruption };

class Sim {
  constructor(p: { runId: Hex; seed: Hex; carTier: number });
  readonly tick: number;               // tick terakhir yang sudah diproses (mulai 0)
  readonly ended: boolean;
  readonly inputHash: Hex;             // hash chain setelah semua entri yang sudah diproses
  step(entries: LogEntry[]): SimEvent[];   // proses tick (this.tick + 1); entries = entri untuk tick itu
  view(): SimView;                     // state untuk render: player, kendaraan terlihat, rantai, lajur merah, aba-aba
}
export function* trafficRows(seed: Hex): Generator<Row>;   // murni dari seed; dipakai juga oleh penonton dan audit
export function appendHash(h: Hex, e: LogEntry): Hex;
export function initialHash(runId: Hex, seed: Hex): Hex;
```

**Aturan tick input:** input yang ditekan saat tick `t` sedang tampil dicatat dengan `tick = t + 1`, artinya input itu berlaku di langkah berikutnya.

### 3.3 PRNG

`sfc32`, dengan dua stream terpisah supaya pengambilan angka lalu lintas tidak menggeser angka NPC:

```ts
const k = keccak256(encodePacked(['bytes32', 'string'], [seed, 'traffic']));   // 'npc' untuk stream NPC
// pecah k menjadi 4 × uint32 (big-endian) → a, b, c, d
function sfc32(a: number, b: number, c: number, d: number) {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return t >>> 0;
  };
}
const int = (min: number, max: number) => min + (next() % (max - min + 1));
const chance = (permille: number) => next() % 1000 < permille;
const lerpInt = (a: number, b: number, x: number, X: number) => a + Math.floor(((b - a) * x) / X);
```

### 3.4 State dan urutan per tick

State pemain: `x` (pusat lateral), `z` (pusat longitudinal; `z = 0` di tick 0), `speed`, `targetLane`, `braking`, `slowTicks`, `nitro`.
Awal: `x = laneCenter(1)`, `z = 0`, `speed = 93`, `targetLane = 1`.

`step()` untuk tick `T` **wajib** mengikuti urutan ini:

1. **Entri tick T:** gangguan penonton dulu (urut `seq`), lalu input pemain (urut `seq`). Setiap entri juga di-`appendHash`.
   - `LEFT`: `targetLane = max(0, targetLane − 1)`. `RIGHT`: `targetLane = min(3, targetLane + 1)`.
   - `BRAKE_ON` / `BRAKE_OFF`: ubah `braking`.
   - `SPEC_*`: `trySchedule(kind, params, warnTick = T)` (lihat §3.7).
2. **NPC:** jika `T == npc.nextWarnTick`, ambil parameter, panggil `trySchedule`, lalu `npc.nextWarnTick += int(240, 360)`.
3. **Aktivasi dan berakhirnya gangguan** yang `activeTick == T` atau `endTick == T`. Rantai mendapat posisi `z = player.z + 3000` saat aktif.
4. **Kecepatan:**
   ```
   if nitro aktif:        speed = min(floor(maxSpeed*3/2), speed + 6)      // rem diabaikan
   else if speed > maxSpeed: speed = max(maxSpeed, speed − 3)            // turun setelah nitro
   else if braking:       speed = max(MIN_SPEED, speed − 4)
   else if slowTicks > 0: (tidak akselerasi)
   else:                  speed = min(maxSpeed, speed + accel)
   if slowTicks > 0: slowTicks −= 1
   ```
5. **Lateral:** `x` bergerak menuju `laneCenter(targetLane)` sejauh `lateral` per tick, tanpa melewati target.
6. **Maju:** `z += speed`.
7. **Lalu lintas:** munculkan baris dari `trafficRows` selama `row.s + TRAFFIC_SPEED*T < z + spawnAhead`. Hapus kendaraan yang `front < z − 225 − despawnBehind`.
8. **Tabrakan:** jika kotak pemain beririsan dengan kendaraan mana pun → `CRASH`, run selesai.
9. **Red zone:** jika rentang `[x−90, x+90]` beririsan dengan lajur merah yang aktif → `RED_ZONE_FAIL`, run selesai.
10. **Rantai:** jika kotak pemain beririsan dengan rantai yang belum pernah kena → `SPIKES_HIT`: `speed = max(MIN_SPEED, floor(speed/2))`, `slowTicks = 45`.
11. **Mepet:** evaluasi sesuai §3.6.
12. Jika `T == RUN_TICKS` → `TIME_UP`, run selesai.

Kotak: pemain `x ± 90`, `z ± 225`. Kendaraan `laneCenter(lane) ± w/2`, `zv ± l/2`, dengan `zv = row.s + TRAFFIC_SPEED*T`. Dua kotak dianggap beririsan jika `aMin < bMax && bMin < aMax` di kedua sumbu.

### 3.5 Generator lalu lintas

Baris adalah fungsi murni dari seed, tidak bergantung pada pemain. Dengan begitu penonton dan halaman audit bisa menghitung ulang lalu lintas yang sama.

```
s = firstRowS; prevFree = {0,1,2,3}; k = 0
loop:
  x = min(s, rampS)
  p2 = lerpInt(150, 500, x, rampS)
  count = chance(p2) ? 2 : 1
  first = int(0,3); lanes = [first]
  if count == 2:
     second = int(0,2); if second >= first: second += 1
     free = {0..3} \ {first, second}
     if free ∩ prevFree == ∅: (buang second, tetap 1 lajur)   // 1 lajur selalu valid
     else lanes.push(second)
  for slot, lane in lanes: type = chance(200) ? TRUCK : CAR; id = k*2 + slot
  yield { k, s, vehicles: [{ id, lane, type }] }
  prevFree = {0..3} \ lanes
  s += lerpInt(2800, 1600, x, rampS) + int(0, 800)
  k += 1
```

Jaminan: dua baris berturutan selalu punya minimal satu lajur bebas yang sama, jadi tidak pernah ada tembok.

### 3.6 Algoritma mepet

Setiap kendaraan `V` punya status `{ overlapSeen, minGap, resolved }`. Pada langkah 11 di setiap tick, untuk setiap `V` yang belum `resolved`:

```
pRear = z − 225; pFront = z + 225
vRear = zv − l/2; vFront = zv + l/2
if pFront > vRear && pRear < vFront:                       // sedang bersisian
    gap = |x − laneCenter(V.lane)| − (90 + w/2)
    overlapSeen = true; minGap = min(minGap, gap)
if pRear > vFront:                                          // selesai disalip
    resolved = true
    if overlapSeen && minGap <= 180 && speed >= 93:
        index += 1; emit NEAR_MISS { index, vehicleId, vehicleType, coins, inputHash }
```

Catatan:
- Kecepatan relatif maksimum ±301 cm/tick, lebih kecil dari panjang tumpang-tindih minimum (900 cm), jadi masa bersisian selalu tertangkap minimal 2 tick.
- Lajur sebelah yang posisinya di tengah menghasilkan gap 170 cm (mobil) atau 135 cm (truk), sehingga terhitung. Selisih dua lajur menghasilkan gap ≥ 485 cm, jadi tidak terhitung.
- Tick saat tabrakan tidak menghasilkan mepet, karena langkah 8 menghentikan run sebelum langkah 11.

### 3.7 Gangguan

```ts
type Disruption = { id: string; source: 'NPC' | 'SPECTATOR'; kind: 'NITRO' | 'SPIKES' | 'RED';
                    lanes: number[]; warnTick: number; activeTick: number; endTick?: number; z?: number };
```

- `activeTick = warnTick + 60`. Nitro: `endTick = activeTick + 90`. Red zone: `endTick = activeTick + [90,150,210][i]`. Rantai tidak punya `endTick`; ia hilang setelah dilewati (`pRear > rantai.z + 150`).
- `trySchedule` membatalkan (event `DISRUPTION_DROPPED`) jika setelah ditambahkan:
  - ada lebih dari 1 nitro yang sedang aba-aba atau aktif, atau
  - ada lebih dari 2 rantai yang belum dilewati, atau
  - ada lebih dari 2 lajur merah berbeda yang sedang aba-aba atau aktif, atau
  - jarak `activeTick` ke `activeTick` gangguan lain yang sedang aba-aba atau aktif kurang dari 30 tick.
- **NPC:** mulai `nextWarnTick = 300`. Saat tiba waktunya, **selalu ambil semua angka dalam urutan ini** (supaya stream tetap sejajar, walaupun nanti dibatalkan):
  `r = int(0,999)` → `kind` (<350 nitro, <750 rantai, sisanya red) · `lane = int(0,3)` · `two = chance(300)` · `durIdx = int(0,2)` · `interval = int(240,360)`.
  Rantai memakai `lane`. Red zone memakai `[lane]`, atau `[min(lane,2), min(lane,2)+1]` jika `two`.
- **Penonton:** backend menentukan `warnTick` dan mengirimnya ke pemain (§4.1). Gangguan hanya masuk log jika pemain mengonfirmasi menerimanya sebelum `warnTick`.

### 3.8 Log dan hash chain

```
h0 = keccak256(encodePacked(['bytes32','bytes32'], [runId, seed]))
h  = keccak256(encodePacked(['bytes32','uint16','uint8','uint32'], [h, tick, kind, data]))   // untuk setiap entri, sesuai urutan proses
```

`inputHash` pada event `NEAR_MISS` adalah nilai `h` setelah semua entri dengan `tick ≤` tick mepet tersebut diproses. Log lengkap run (entri, `seed`, `carTier`, `CONFIG_VERSION`) dipublikasikan di `GET /runs/:id/log` setelah run selesai.

## 4. Protokol realtime (WebSocket, JSON)

Setiap pesan berbentuk `{ "t": "<tipe>", ...payload }`. Waktu server dalam ms epoch.

### 4.1 Pemain — `/ws/play?token=<JWT>`

| Arah | Tipe | Payload | Catatan |
|---|---|---|---|
| C→S | `ping` | `clientMs` | Sinkronisasi jam; S membalas `pong { clientMs, serverMs }` |
| C→S | `run.ready` | `runId` | S membalas `run.go { startAt }` (`startAt = now + 3000`); tick 1 terjadi di `startAt + 33,3 ms` |
| C→S | `input` | `tick, kind, seq` | Kirim segera saat ditekan |
| C→S | `watermark` | `tick` | Setiap 100 ms; janji tidak ada input lagi untuk tick ≤ nilai ini |
| S→C | `disruption.scheduled` | `id, kind, lanes, durationIndex?, warnTick, by` | Hanya untuk gangguan penonton |
| C→S | `disruption.ack` | `id, applied` | `applied = true` jika diterima saat tick lokal < `warnTick` |
| C→S | `snapshot` | `tick, x, z, speed, targetLane, nearMisses` | 10 Hz; hanya untuk tampilan penonton, tidak dipakai verifikasi |
| S→C | `nearMiss.verified` | `index, tick, vehicleType, coins` | Hasil verifikasi backend |
| S→C | `nearMiss.recorded` | `index, txHash, blockNumber, latencyMs` | Dari indexer; untuk panel feed on-chain |
| S→C | `run.qualified` | `tier, txHash` | Dari event `Qualified` |
| C→S | `run.end` | `tick, reason, nearMisses, inputHash` | Klaim client; hasil backend tetap yang berlaku |
| S→C | `run.result` | `status, reason, endTick, nearMisses, coins, qualifiedTiers` | `status`: `VERIFIED` / `PARTIAL` / `INVALID` |
| S→C | `error` | `code, message` | |

**Saat koneksi putus:** client tetap menjalankan sim, menyimpan `input` dan `disruption.ack` di buffer, lalu mengirim semuanya (berurutan) begitu tersambung. Gangguan penonton yang tidak diterima sebelum `warnTick` di-ack dengan `applied=false`.

### 4.2 Penonton — `/ws/watch?room=<KODE>&nick=<opsional>`

| Arah | Tipe | Payload |
|---|---|---|
| S→C | `room.state` | `code, expiresAt, spectators, run: { runId, seed, carTier, startAt } \| null` |
| S→C | `run.snapshot` | Diteruskan dari pemain (10 Hz) |
| S→C | `disruption.scheduled` | Dikirim ke semua penonton, termasuk `by` (nick) |
| S→C | `energy` | `value` |
| C→S | `disrupt` | `kind: 'NITRO' \| 'SPIKES' \| 'RED'`, `lane?`, `durationIndex?` |
| S→C | `disrupt.accepted` / `disrupt.rejected` | `id` / `reason: 'ENERGY' \| 'LIMIT' \| 'NO_RUN' \| 'RATE' \| 'ROOM_EXPIRED'` |
| S→C | `nearMiss.recorded`, `run.result` | Sama dengan pemain |

## 5. Backend (`backend`)

### 5.1 REST API

| Method | Path | Auth | Fungsi |
|---|---|---|---|
| POST | `/auth/nonce` | — | `{ address }` → `{ nonce }`, berlaku 5 menit |
| POST | `/auth/verify` | — | `{ message, signature }` (SIWE) → `{ token }` (JWT 12 jam) |
| GET | `/me` | JWT | `address, coins, coinsPending, coinsReserved, ownedTiers, qualifiedTiers, bestRun` |
| GET | `/config` | — | Isi `packages/config` + alamat kontrak |
| POST | `/rooms` | JWT | → `{ code, expiresAt }` |
| GET | `/rooms/:code` | — | Status room |
| POST | `/runs` | JWT | `{ carTier, roomCode? }` → `{ runId, seed, seedBlock, configVersion }` |
| GET | `/runs/:id` | — | Ringkasan, status, daftar mepet + tx hash |
| GET | `/runs/:id/log` | — | Log lengkap untuk audit (setelah run selesai) |
| POST | `/vouchers` | JWT | `{ tier }` → `{ voucher, signature, expiresAt }` |
| GET | `/leaderboard` | — | P1: mepet terbanyak per run |

### 5.2 Membuat run (`POST /runs`)

1. Tolak jika alamat masih punya run aktif, sudah melewati batas run per jam, atau tidak memiliki `carTier` (cek `CarNFT.ownsTier` untuk tier > 0).
2. `seedBlock = latestBlock − 3`. `runId = keccak256(encodePacked(address, uint64 serverNonce))`.
3. `seed = keccak256(abi.encode(blockhash(seedBlock), runId, player))`, rumus yang sama dengan kontrak.
4. Simpan run berstatus `CREATED`, lalu masukkan `RunStart` ke antrean relayer.

### 5.3 Loop verifikasi per run

- Simpan entri yang masuk. Sim backend boleh memproses tick `T` jika:
  - `watermark ≥ T`, **dan**
  - semua gangguan penonton dengan `warnTick ≤ T` sudah di-ack.
- Gangguan dengan `applied=true` masuk log sebagai `SPEC_*` pada `warnTick`, dan dimasukkan ke sim dengan aturan urutan §3.4.
- Setiap `NEAR_MISS` disimpan ke DB, dikirim sebagai `nearMiss.verified`, lalu dimasukkan ke antrean relayer.
- **Anti-speedhack:** tolak run (status `INVALID`) jika `watermark > floor((nowServer − startAt) / 33.33) + 30`.
- **Selesai:** event `CRASH`, `RED_ZONE_FAIL`, atau `TIME_UP` dari sim backend → `RunEnd` ke relayer dan `run.result` ke client.
- **Timeout:** jika pada `startAt + 100 dtk + 30 dtk` sim belum selesai, akhiri pada tick terakhir yang sudah terverifikasi dengan `reason = TIMEOUT` dan `status = PARTIAL`.
- Jika klaim `run.end` dari client berbeda dengan hasil backend, catat sebagai flag anti-cheat. Hasil backend yang berlaku.

### 5.4 Room dan gangguan penonton

- Kode room: 6 karakter dari `ROOM.alphabet`, unik, kedaluwarsa 15 menit setelah dibuat.
- Energi penonton dihitung di server berdasarkan waktu nyata: `min(100, energi + 10/detik)`.
- Saat menerima `disrupt`:
  1. Cek room aktif, ada run aktif, rate pesan, dan energi.
  2. Hitung `warnTick = estimasiTickSekarang + 15`.
  3. Cek awal batas §3.7 terhadap state sim backend (supaya jarang dibatalkan).
  4. Kurangi energi, simpan, lalu kirim `disruption.scheduled` ke pemain dan semua penonton.
- Jika pemain akhirnya mengirim `applied=false`, energi penonton **tidak** dikembalikan (sederhana untuk MVP).

### 5.5 Ledger koin dan voucher

- Koin dikreditkan oleh **indexer** saat event `NearMiss` terbaca (+100/+200 sesuai `vehicleType`), dengan referensi unik `runId:index` supaya idempoten.
- `coinsPending` = mepet yang sudah terverifikasi tapi belum tercatat on-chain (hanya untuk tampilan).
- `POST /vouchers`:
  1. Cek `RunRegistry.isQualified(address, tier)` **langsung dari kontrak** (bukan dari cache DB), belum memiliki tier itu, suplai belum habis, dan `koin − reserved ≥ coinCost`. Cek ini hanya untuk UX; yang menegakkan tetap `CarNFT.buy()`.
  2. Buat reservasi `{ nonce, tier, coinCost, expiresAt = now + 600 dtk }`.
  3. Tanda tangani voucher EIP-712 (§6.3).
- Saat event `Purchased(nonce)` terbaca: ledger `−coinCost` dengan referensi `voucher:nonce`, dan reservasi menjadi `CONSUMED`.
- Job berkala: reservasi yang kedaluwarsa tanpa event pembelian menjadi `RELEASED`.

### 5.6 Skema DB (SQLite, Drizzle)

```
users(address PK, created_at)
coin_ledger(id PK, address, delta INT, ref TEXT UNIQUE, created_at)          -- saldo = SUM(delta)
reservations(nonce PK, address, tier, coin_cost, expires_at, status)          -- ACTIVE | CONSUMED | RELEASED
qualifications(address, tier, run_id, tx_hash, block_number, PRIMARY KEY(address, tier))
                                                                             -- cache dari event Qualified; BUKAN gerbang pembelian
rooms(code PK, host_address, created_at, expires_at)
runs(id PK, address, car_tier, seed, seed_block, room_code, config_version, status, end_reason,
     end_tick, near_misses, start_at, created_at, flags TEXT)
run_entries(run_id, seq, tick, kind, data, PRIMARY KEY(run_id, seq))
disruptions(id PK, run_id, source, kind, lanes, duration_index, warn_tick, applied, spectator_nick, created_at)
near_misses(run_id, idx, tick, vehicle_id, vehicle_type, input_hash, tx_hash, block_number,
            verified_at, recorded_at, PRIMARY KEY(run_id, idx))
chain_cursor(name PK, last_block)
```

### 5.7 Rate limit dan anti-cheat MVP

- 1 run aktif per alamat; maksimal 20 run per jam per alamat.
- Speedhack: aturan watermark §5.3.
- Kecocokan klaim client vs hasil backend (flag).
- P2: analisis pola waktu reaksi untuk deteksi bot.

## 6. Smart contract (`/contract`, Foundry + OpenZeppelin v5)

### 6.1 `RunRegistry.sol`

```solidity
struct Run {
    address player; uint8 carTier; uint16 configVersion; bool ended; uint8 endReason;
    uint16 nearMisses; uint16 lastTick; uint64 startBlock; bytes32 seed;
}
struct StartRec    { bytes32 runId; address player; uint8 carTier; uint64 seedBlock; uint16 configVersion; }
struct NearMissRec { bytes32 runId; uint16 index; uint16 tick; uint8 vehicleType; uint32 vehicleId; bytes32 inputHash; }
struct EndRec      { bytes32 runId; uint8 reason; uint16 endTick; uint16 totalNearMisses; bytes32 finalInputHash; }

// reason: 0 TIME_UP, 1 CRASH, 2 RED_ZONE_FAIL, 3 TIMEOUT

function submitBatch(StartRec[] calldata s, NearMissRec[] calldata n, EndRec[] calldata e) external onlyAttester;
function isQualified(address player, uint8 tier) external view returns (bool);
function qualifyingRun(address player, uint8 tier) external view returns (bytes32);
function getRun(bytes32 runId) external view returns (Run memory);
function setAttester(address a) external onlyOwner;
function setCarNFT(address c) external onlyOwner;          // hanya bisa sekali

event RunStarted(bytes32 indexed runId, address indexed player, uint8 carTier, bytes32 seed, uint64 seedBlock, uint16 configVersion);
event NearMiss(bytes32 indexed runId, address indexed player, uint16 index, uint16 tick, uint8 vehicleType, uint32 vehicleId, bytes32 inputHash);
event RunEnded(bytes32 indexed runId, uint8 reason, uint16 endTick, uint16 totalNearMisses, bytes32 finalInputHash);
event Qualified(address indexed player, uint8 indexed tier, bytes32 runId, uint16 tick);
```

Aturan, diproses berurutan: semua `s`, lalu semua `n`, lalu semua `e`.

- **StartRec:**
  - `runId` belum ada.
  - `seedBlock < block.number` dan `block.number − seedBlock ≤ 256`, dengan `blockhash(seedBlock) != 0`.
  - `carTier == 0 || carNFT.ownsTier(player, carTier)`.
  - Simpan `seed = keccak256(abi.encode(blockhash(seedBlock), runId, player))` dan `startBlock = block.number`.
- **NearMissRec:**
  - Run ada, belum `ended`, dan `block.number − startBlock ≤ maxRunBlockSpan (750)`.
  - Jika `index ≤ run.nearMisses` → **lewati tanpa revert** (idempoten untuk retry relayer).
  - Jika `index != run.nearMisses + 1` → revert `IndexGap`.
  - `tick ≤ 3000` dan `tick ≥ lastTick`.
  - Setelah `nearMisses += 1`: untuk setiap tier 1..4, jika `nearMisses == reqNearMiss[tier]`, `carTier ≥ minCarTier[tier]`, dan pemain belum lulus tier itu → set `qualified` dan `qualifyingRun`, lalu emit `Qualified`.
- **EndRec:** run ada dan belum `ended`, `totalNearMisses == run.nearMisses`, `endTick ≤ 3000`. Setelah itu set `ended`.
- `reqNearMiss` dan `minCarTier` di-set di constructor dan **immutable**. Tidak ada setter.
- Error: `NotAttester, RunExists, UnknownRun, RunEnded, IndexGap, TickOutOfRange, RunTooOld, SeedBlockInvalid, CarNotOwned, CountMismatch, CarNFTAlreadySet`.
- Penulisan storage hanya per-run dan per-pemain. Tidak ada counter global di jalur `submitBatch`.

### 6.2 `CarNFT.sol` (ERC-721 + ERC-5192, soulbound)

Nama koleksi: **Racing Gang Cars**, simbol **RGC**.

```solidity
struct Voucher { address buyer; uint8 tier; uint32 coinCost; uint256 nonce; uint64 expiry; }

function buy(Voucher calldata v, bytes calldata sig) external payable;
function ownsTier(address owner, uint8 tier) external view returns (bool);
function tokenTier(uint256 tokenId) external view returns (uint8);
function tokenRun(uint256 tokenId) external view returns (bytes32);
function minted(uint8 tier) external view returns (uint256);
function locked(uint256 tokenId) external view returns (bool);     // selalu true
function setVoucherSigner(address s) external onlyOwner;
function withdraw(address payable to) external onlyOwner;          // MON ke treasury

event Purchased(address indexed buyer, uint8 indexed tier, uint256 tokenId, uint256 voucherNonce, uint32 coinCost, bytes32 runId);
event Locked(uint256 tokenId);
```

Aturan `buy`:
- `msg.sender == v.buyer`, `block.timestamp ≤ v.expiry`, nonce belum dipakai, dan tanda tangan valid dari `voucherSigner`.
- `1 ≤ v.tier ≤ 4`, dan `registry.isQualified(msg.sender, v.tier)`.
- `msg.value == price[v.tier]`, `!ownsTier(msg.sender, v.tier)`, dan `minted[v.tier] < supply[v.tier]`.
- Mint ke `msg.sender`, simpan `tokenTier` dan `tokenRun = registry.qualifyingRun(...)`, lalu emit `Locked` dan `Purchased`.

Lain-lain:
- Soulbound: override `_update` dan revert `Soulbound()` jika `from != address(0)`. `approve` dan `setApprovalForAll` juga revert.
- `supportsInterface` mengembalikan true untuk `type(IERC5192).interfaceId`.
- `price[]` dan `supply[]` di-set di constructor dan **immutable**. **Tidak ada fungsi mint admin.**
- `tokenURI` = `baseURI + tier + ".json"`, berisi metadata nama, gambar, dan statistik.
- Error: `NotQualified, WrongPrice, SoldOut, AlreadyOwned, VoucherExpired, VoucherUsed, BadSignature, WrongBuyer, Soulbound, BadTier`.

### 6.3 EIP-712 voucher

- Domain: `{ name: "RacingGangCars", version: "1", chainId, verifyingContract: CarNFT }`.
- Type: `Voucher(address buyer,uint8 tier,uint32 coinCost,uint256 nonce,uint64 expiry)`.
- Backend menandatangani dengan `VOUCHER_SIGNER_PRIVATE_KEY`. Kunci ini **berbeda** dari kunci attester.

### 6.4 Deploy (Monad testnet)

1. Deploy `RunRegistry(attester, reqNearMiss[], minCarTier[])`.
2. Deploy `CarNFT(registry, voucherSigner, price[], supply[], baseURI)`.
3. Panggil `registry.setCarNFT(carNFT)`.
4. Verifikasi kedua kontrak di explorer.
5. Tulis alamat dan ABI ke `packages/config/deployments/monad-testnet.json`.

Isi wallet attester dengan MON testnet yang cukup untuk ratusan transaksi.

## 7. Integrasi chain (`backend/src/chain`)

### 7.1 Relayer

- Satu wallet attester, nonce dikelola lokal, **satu transaksi dalam perjalanan** pada satu waktu.
- Setiap 400 ms, jika tidak ada transaksi pending dan antrean tidak kosong:
  - Susun batch: semua `StartRec` siap, maksimal 60 `NearMissRec` (urut per run lalu `index`), lalu `EndRec` yang semua mepetnya sudah ikut.
  - `estimateGas`, lalu set `gasLimit = estimasi × 1,1`. **Monad menagih gas berdasarkan gas limit, bukan gas terpakai**, jadi jangan beri margin besar.
  - Kirim, tunggu receipt, lalu hapus record yang berhasil dari antrean.
- **Jika revert:** decode error-nya. `UnknownRun`/`IndexGap` karena urutan → kembalikan ke antrean. Selain itu, bagi batch menjadi dua untuk mengisolasi record yang bermasalah dan catat ke log.
- Jika `RunStart` gagal permanen (misalnya `SeedBlockInvalid` karena RPC lama mati), tandai run `RECORD_FAILED` dan beri tahu pemain.

### 7.2 Indexer

- Berlangganan log `RunRegistry` dan `CarNFT` lewat WSS. Saat start, lakukan backfill dengan `getLogs` dari `chain_cursor`.
- Tangani event:
  - `RunStarted`: cocokkan `seed` dengan DB; jika beda → run `INVALID`.
  - `NearMiss`: isi `tx_hash`, `block_number`, `recorded_at`, kredit koin, kirim `nearMiss.recorded` (dengan `latencyMs = recorded_at − verified_at`).
  - `Qualified`: simpan ke tabel `qualifications` (cache untuk garasi) dan kirim `run.qualified`.
  - `Purchased`: potong koin dan konsumsi reservasi.

### 7.3 Voucher signer

`signVoucher(v)` memakai viem `signTypedData`. Fungsi ini dipanggil dari `POST /vouchers`.

## 8. Frontend (`frontend`)

### 8.1 Halaman

| Rute | Isi |
|---|---|
| `/` | Garasi: connect wallet dan SIWE; koin (terkonfirmasi, pending, disisihkan); 5 mobil dengan statistik, syarat, status lulus, status dimiliki, sisa suplai; tombol pilih mobil dan Beli |
| `/play` | Game dan HUD. Opsi "Main solo" atau "Buat room" |
| `/room` | Host: kode room besar, QR (P1), jumlah penonton, tombol mulai run |
| `/watch` dan `/watch/:code` | Penonton (mobile-first): masuk dengan kode dan nick; status run; bar energi; tombol Nitro, Rantai, Red zone (3/5/7 dtk); pemilih lajur 1–4; feed gangguan |
| `/run/:id` | Hasil dan audit (§8.5) |
| `/leaderboard` | P1 |

### 8.2 Game

- three.js lewat react-three-fiber. Kamera chase dari belakang-atas; jalan 4 lajur; model 5 mobil pemain, mobil lalu lintas, truk, dan rantai.
- Loop: akumulator waktu dengan langkah tetap 33,33 ms memanggil `sim.step()`; render menginterpolasi dua state terakhir.
- Mulai: `run.ready` → `run.go { startAt }` → hitung mundur 3 detik berdasarkan jam yang sudah disinkronkan (offset dari `ping/pong`).
- HUD: sisa waktu, kecepatan (km/j = cm/tick × 1,08), jumlah mepet dan target tier berikutnya, koin run ini, efek "+100/+200" saat mepet.
- **Aba-aba gangguan:** 2 detik sebelum aktif, lajur berkedip merah atau kuning, ikon dan hitung mundur 2–1, dan suara. Red zone aktif tampil sebagai lajur merah solid.
- **Panel feed on-chain:** setiap `nearMiss.recorded` menampilkan `#index · blok N · 0,9 dtk` dengan tautan tx ke explorer. Ini visual utama untuk "why Monad".

### 8.3 Netcode client

- Kirim `input` segera saat tombol ditekan atau dilepas (rem), dengan `tick = tickSekarang + 1`.
- Kirim `watermark` setiap 100 ms, dan `snapshot` 10 Hz.
- Saat menerima `disruption.scheduled`: jika tick lokal < `warnTick`, masukkan entri `SPEC_*` ke antrean sim pada `warnTick` dan kirim `ack applied=true`. Jika sudah lewat, kirim `ack applied=false`.
- Saat putus: game jalan terus, pesan masuk buffer, coba sambung ulang dengan backoff, lalu kirim ulang berurutan.

### 8.4 Alur beli

1. Pastikan wallet ada di Monad testnet (minta switch chain jika perlu).
2. `POST /vouchers { tier }`.
3. `writeContract(CarNFT.buy, [voucher, signature], { value: price })`.
4. Tunggu receipt, lalu refresh `/me`. Tampilkan lencana "Soulbound" dan tombol "Coba transfer" (P1, untuk demo: diharapkan gagal).

### 8.5 Halaman audit (P1, dikerjakan Bayu)

1. Ambil `GET /runs/:id/log`.
2. Replay dengan `packages/sim` di browser untuk mendapatkan daftar mepet `{ index, tick, vehicleType, inputHash }`.
3. Ambil event `RunStarted`, `NearMiss`, dan `RunEnded` untuk `runId` itu langsung dari RPC.
4. Bandingkan seed, jumlah, tick, jenis kendaraan, dan `inputHash` per mepet, lalu tampilkan ✓/✗ per baris dan kesimpulan.

## 9. Kasus khusus

| Kasus | Perilaku |
|---|---|
| Tab pemain di-refresh saat run | State sim hilang; run berakhir `TIMEOUT` (`PARTIAL`) pada tick terakhir yang terverifikasi |
| Dua tab memulai run | Ditolak; hanya 1 run aktif per alamat |
| Batch tx revert | Batch dibagi dua dan dicoba ulang; record duplikat dilewati kontrak |
| RPC mati sementara | Antrean menumpuk lalu terkirim saat pulih. Jika lewat 750 blok, record ditolak (`RunTooOld`) dan run ditandai `RECORD_FAILED` |
| Seed berbeda dengan event `RunStarted` | Run `INVALID` tanpa penalti; minta main ulang |
| Voucher kedaluwarsa | Reservasi dilepas; minta voucher baru |
| Pembelian revert | Koin tidak terpotong, karena pemotongan hanya terjadi lewat event `Purchased` |
| Penonton spam | Energi, batas global, dan maksimal 10 pesan/detik per koneksi |
| Gangguan saat tidak ada run | `disrupt.rejected NO_RUN` |
| Kode room kedaluwarsa saat run berjalan | Run selesai normal; gangguan baru ditolak `ROOM_EXPIRED` |
| Wallet di jaringan lain | Frontend meminta switch ke Monad testnet |

## 10. Variabel lingkungan

```
# contracts
DEPLOYER_PRIVATE_KEY, ATTESTER_ADDRESS, VOUCHER_SIGNER_ADDRESS, TREASURY_ADDRESS, MONAD_RPC_URL, NFT_BASE_URI

# server
DATABASE_URL, JWT_SECRET, CHAIN_ID, MONAD_RPC_URL, MONAD_WS_URL,
ATTESTER_PRIVATE_KEY, VOUCHER_SIGNER_PRIVATE_KEY, RUN_REGISTRY_ADDRESS, CAR_NFT_ADDRESS, CORS_ORIGIN

# web
VITE_API_URL, VITE_WS_URL, VITE_CHAIN_ID, VITE_RPC_URL, VITE_EXPLORER_URL,
VITE_RUN_REGISTRY_ADDRESS, VITE_CAR_NFT_ADDRESS
```

RPC testnet umum: `https://testnet-rpc.monad.xyz` dan `wss://testnet-rpc.monad.xyz`. Cek `CHAIN_ID` dan URL explorer di dokumentasi resmi Monad. Untuk demo dengan banyak pemain, pertimbangkan RPC khusus (misalnya Alchemy atau QuickNode) agar tidak terkena rate limit RPC publik.
