# BACKEND PLAN — Racing Gang

**Versi:** 1.0 · 21 Oktober 2026 · pasangan dari `PRD.md`, `TECH_SPEC.md`, dan `TASKS.md` (Draft 1.2)
**Pemilik:** Dharu (Backend) · DH-1 s/d DH-11

> §3 (sim) dan §4–5 (protokol, backend) di TECH_SPEC adalah wilayah Dharu. Hampir semua perbaikan gap di sini bersifat internal, jadi tidak melanggar interface freeze. Keputusan yang menyimpang dari atau melengkapi spec ditandai **[Keputusan]**.

---

## A. Struktur repo

Pakai folder `backend/ frontend/ contract/`, dan paket bersama di root (sudah tercantum di TECH_SPEC §2.1).

```
racing-gang/
  package.json            private, script root (dev, test, lint)
  pnpm-workspace.yaml     packages: ["packages/*", "backend", "frontend"]
  tsconfig.base.json      strict, ES2022, moduleResolution "bundler"
  packages/config/        @racing-gang/config   (Dharu; dipakai semua)
  packages/sim/           @racing-gang/sim      (Dharu; dipakai semua)
  backend/                @racing-gang/backend  (Dharu; src/chain milik Bayu)
  frontend/               Raka
  contract/               Foundry (Bayu), bukan workspace pnpm
```

Paket `config` dan `sim` diekspor sebagai **source TS** (`"exports": { ".": "./src/index.ts" }`). Tidak perlu build step: Vite (frontend) dan `tsx` (backend) langsung membacanya.

**Dependensi backend:** `fastify`, `@fastify/websocket`, `@fastify/cors`, `@fastify/jwt`, `@fastify/rate-limit`, `drizzle-orm`, `better-sqlite3`, `viem`, `zod`. Dev: `drizzle-kit`, `tsx`, `vitest`, `pino-pretty`, `@types/better-sqlite3`.

---

## B. Fase 0 — Persiapan non-kode

Repo ini bukan repo submission lomba, jadi coding tidak perlu menunggu hari H (TASKS §0 aturan #1). Item di bawah bisa berjalan paralel dengan Fase 1.

- [ ] Siapkan hosting backend dengan **WSS + persistent volume + 1 instance** (Fly.io + volume, Railway + volume, atau VPS + Caddy). Matikan autoscale dan scale-to-zero.
- [ ] Siapkan domain HTTPS untuk backend.
- [ ] Umumkan ke Bayu dan Raka: perubahan §2.1 (struktur folder) dan tes `blockhash` Monad begitu kontrak bisa di-deploy (Fase 6).
- [ ] Siapkan 1 private key testnet khusus untuk bot test (bukan wallet presenter).

---

## C. Fase 1 — Fondasi bersama (DH-1, target M0)

### C1. `packages/config`

```
src/index.ts       konstanta §2.2 apa adanya (CONFIG_VERSION, TICK_RATE, CARS, ...)
src/enums.ts       EntryKind, EndReason {TIME_UP=0, CRASH=1, RED_ZONE_FAIL=2, TIMEOUT=3}
src/protocol.ts    tipe pesan WS + body/response REST + kode error
src/deployments.ts loader monad-testnet.json (aman kalau file belum ada → null)
scripts/export-json.ts  → contract/config/cars.json
deployments/monad-testnet.json   (diisi Bayu setelah deploy)
```

`export-json.ts` menghasilkan:

```json
{ "reqNearMiss": [0,40,75,110,150], "minCarTier": [0,0,1,2,3],
  "priceWei": ["0","50000000000000000", "..."], "supply": [0,1000,300,100,30] }
```

`priceWei` dihitung dengan `parseEther(priceMon).toString()`.

`protocol.ts` berisi discriminated union per arah:
- `PlayC2S`: `ping | run.ready | input | watermark | disruption.ack | snapshot | run.end`
- `PlayS2C`: `pong | run.go | disruption.scheduled | nearMiss.verified | nearMiss.recorded | run.qualified | run.result | error`
- `WatchC2S` dan `WatchS2C` sesuai §4.2.
- Tipe request dan response untuk setiap endpoint REST §5.1.
- `ApiErrorCode`: `UNAUTHORIZED, ACTIVE_RUN_EXISTS, RUN_LIMIT, CAR_NOT_OWNED, ROOM_NOT_FOUND, ROOM_EXPIRED, ROOM_BUSY, NOT_ROOM_HOST, NOT_QUALIFIED, ALREADY_OWNED, SOLD_OUT, INSUFFICIENT_COINS, CHAIN_UNAVAILABLE`.

### C2. Stub `packages/sim` (kirim ke Raka secepatnya)

Signature final §3.2 dengan isi dummy: `step()` hanya `z += speed`, `trafficRows()` menghasilkan baris tetap, `view()` sudah berbentuk final.

**Selesai jika:** `frontend` dan `backend` bisa `import { CARS } from '@racing-gang/config'` dan `import { Sim } from '@racing-gang/sim'`; `cars.json` terbaca oleh script deploy Bayu; tipe di `protocol.ts` sudah di-review Raka.

---

## D. Fase 2 — `packages/sim` inti (DH-2)

### D1. File

```
src/prng.ts        sfc32, streamFrom(seed, 'traffic'|'npc'), makeRng → { next, int, chance }, lerpInt
src/hash.ts        initialHash(runId, seed), appendHash(h, entry)
src/traffic.ts     trafficRows(seed): Generator<Row>
src/geometry.ts    laneCenter, overlap(aMin,aMax,bMin,bMax), playerBox, vehicleBox
src/player.ts      stepSpeed(state, car, nitroActive), stepLateral(state, car)
src/nearMiss.ts    VehicleTrack {overlapSeen, minGap, resolved}, evaluate()
src/disruptions.ts (Fase 3)
src/npc.ts         (Fase 3)
src/sim.ts         class Sim: urutan 12 langkah §3.4
src/replay.ts      replay(log) → { events, finalHash, endTick }
src/types.ts       LogEntry, SimEvent, SimView, Disruption, Row
```

### D2. Aturan implementasi

- Tanpa `Math.random`, tanpa `Date.now`, tanpa float. Semua pembagian dengan `Math.floor`. Pasang ESLint `no-restricted-properties` khusus paket ini.
- `step()` mengikuti langkah 1–12 §3.4 persis, dan setiap langkah diberi komentar nomornya.
- Urutan entri per tick: SPEC dulu, lalu input pemain. Tiap entri di-`appendHash` sesuai urutan proses.
- **[Keputusan] Perbaikan pseudocode §3.5:** satu baris bisa berisi 1–2 kendaraan, dan `chance(truck)` diambil per slot sesuai urutan `lanes`:
  ```
  vehicles = lanes.map((lane, slot) => ({ id: k*2+slot, lane, type: chance(200) ? TRUCK : CAR }))
  ```
- Hash memakai `encodePacked(['bytes32','uint16','uint8','uint32'], ...)`. Nilai `tick` maksimal 3000, aman untuk uint16.
- Setelah `ended`, `step()` melempar error. Ini mencegah bug pemanggilan ganda di server.
- Sim mengekspos `snapshotLimits()` (gangguan aktif dan sedang aba-aba). Server memakainya untuk cek awal di Fase 7.

### D3. Test (Vitest)

- [ ] PRNG: fixture 10 angka pertama untuk 2 seed tetap.
- [ ] Hash: `initialHash` + 3 entri → nilai tetap. Bayu membuat 1 test Forge dengan input sama; hasilnya harus identik.
- [ ] Lalu lintas: 1.000 seed, tidak ada dua baris berturutan yang menutup semua lajur; `s` naik monoton; kepadatan naik seiring `s`.
- [ ] Mepet:
  - menyalip dari lajur sebelah → terhitung (gap 170 untuk mobil, 135 untuk truk)
  - dua lajur jauhnya → tidak
  - speed < 93 → tidak
  - tabrakan → tidak ada mepet di tick itu
  - satu kendaraan hanya dihitung sekali
  - truk memberi 200 koin
  - `index` naik 1, 2, 3, ...
- [ ] Tabrakan saat pindah lajur di tengah jalan terdeteksi.
- [ ] `TIME_UP` tepat di tick 3000.
- [ ] **Golden fixture** `fixtures/golden-{1..3}.json` = `{ runId, seed, carTier, configVersion, log, expectedEvents, finalHash }`, dibuat dengan `pnpm sim:fixture` dari log hasil bot (Fase 5). Test Node membandingkan hasil replay dengan fixture. Raka membuat halaman `/dev/golden` yang memuat fixture yang sama di browser dan menampilkan PASS/FAIL.

**Selesai jika:** semua test hijau dan golden fixture PASS di Node dan browser.

---

## E. Fase 3 — Gangguan di sim (DH-3)

- [ ] `trySchedule(kind, lanes, durIdx, warnTick, source)`: `activeTick = warnTick + 60`; `endTick` untuk nitro dan red zone. Emit `DISRUPTION_WARN`. Kalau melanggar batas §3.7, emit `DISRUPTION_DROPPED`.
- [ ] Langkah 3 §3.4: aktivasi dan berakhirnya gangguan. Rantai mendapat `z = player.z + 3000` saat aktif dan hilang setelah `pRear > z + 150`.
- [ ] Efek:
  - nitro: batas `floor(maxSpeed*3/2)`, +6 per tick, rem diabaikan; setelah selesai turun 3 per tick
  - rantai: `speed = max(80, floor(speed/2))`, `slowTicks = 45`
  - red zone: `[x−90, x+90]` beririsan dengan lajur merah yang aktif → `RED_ZONE_FAIL`
- [ ] NPC: `nextWarnTick = 300`. Selalu ambil angka dalam urutan `r, lane, two, durIdx, interval`, termasuk saat gangguannya dibatalkan.
- [ ] Ekspor `canSchedule(limitsSnapshot, kind, lanes, warnTick)` yang murni (tanpa mutasi). Server memakainya untuk cek awal.
- [ ] **[Keputusan] ID gangguan dibuat deterministik dari log:** NPC `n{k}`, penonton `s{warnTick}`. Server tidak mengirim ID ke sim; server menyimpan pemetaan ID-nya sendiri.

**Test:**
- [ ] Tidak pernah ada lebih dari 2 lajur merah, 1 nitro, 2 rantai; jeda antar-aktivasi ≥ 30 tick.
- [ ] Aba-aba selalu tepat 60 tick.
- [ ] Red zone saat aba-aba belum menggagalkan run; saat aktif menggagalkan.
- [ ] Jadwal NPC identik dengan dan tanpa gangguan penonton (stream tidak bergeser).
- [ ] Golden fixture diperbarui dengan gangguan.

---

## F. Fase 4 — Kerangka server (DH-4)

### F1. Struktur `backend/src`

```
index.ts            bootstrap: env → db → services → chain (mock/live) → routes → ws → jobs → listen
env.ts              validasi zod untuk semua env §10 + CHAIN_MODE, SEED_SOURCE, PUBLIC_ORIGIN
db/schema.ts        Drizzle schema (F2)
db/client.ts        better-sqlite3, PRAGMA journal_mode=WAL, foreign_keys=ON
db/migrations/      hasil drizzle-kit
auth/nonceStore.ts  Map<nonce, expiresAt>, sekali pakai
auth/privy.ts       login utama: verifikasi access token Privy + ikat DID ke embedded wallet
auth/siwe.ts        login SIWE untuk bot dan pengembangan (ALLOW_SIWE_LOGIN)
auth/guard.ts       Authenticator: token Privy (ES256) atau JWT game (HS256) → alamat wallet
services/
  ledger.ts         credit, debit, balance, pending, reserved
  reservations.ts   create, consume, releaseExpired
  rooms.ts          RoomManager (memori + tabel rooms)
  runs.ts           RunManager: create, getActive, sessions Map<runId, RunSession>
  runSession.ts     verifikasi per run (Fase 5)
  chainReads.ts     isQualified, ownsTier, minted, getBlock (viem public client + cache singkat)
ws/hub.ts           kirim ke address, ke room, broadcast
ws/play.ts          handler /ws/play
ws/watch.ts         handler /ws/watch
routes/             auth, me, config, rooms, runs, vouchers, leaderboard, health
chain/ports.ts      (Dharu) antarmuka server ↔ chain
chain/bus.ts        (Dharu) EventEmitter bertipe untuk ChainEvent
chain/mock.ts       (Dharu) relayer + indexer palsu
chain/relayer.ts, indexer.ts, voucher.ts   (Bayu)
jobs/               releaseReservations.ts, runTimeouts.ts
scripts/bot.ts      bot pemain
scripts/spectators.ts  load test penonton
```

### F2. Skema DB

Spec §5.6 ditambah keputusan berikut:

```
users(address PK, created_at)
coin_ledger(id PK, address, delta, ref UNIQUE, created_at)
reservations(nonce PK, address, tier, coin_cost, expires_at, status, voucher_json)
qualifications(address, tier, run_id, tx_hash, block_number, PK(address,tier))   -- dari spec v1.2
owned_cars(address, tier, token_id, run_id, tx_hash, PK(address,tier))           -- [Keputusan] cache Purchased
rooms(code PK, host_address, created_at, expires_at)
runs(id PK, address, car_tier, seed, seed_block, room_code, config_version,
     lifecycle,      -- CREATED | READY | RUNNING | ENDED
     result,         -- VERIFIED | PARTIAL | INVALID (null sampai ENDED)
     chain_status,   -- PENDING | RECORDED | RECORD_FAILED
     end_reason, end_tick, near_misses, final_hash, start_at, created_at, flags)
run_entries(run_id, ord, tick, kind, data, source, client_seq, disruption_id, PK(run_id, ord))
disruptions(id PK, run_id, source, kind, lanes, duration_index, warn_tick, sched_order,
            acked, applied, spectator_nick, created_at)
near_misses(run_id, idx, tick, vehicle_id, vehicle_type, coins, input_hash, tx_hash,
            block_number, verified_at, recorded_at, PK(run_id, idx))
chain_cursor(name PK, last_block)
```

Alasan perubahan:
- **[Keputusan] `ord`:** `seq` dari client bisa bentrok dengan entri server. `ord` = urutan hash, jadi audit cukup replay berdasarkan `ord`.
- **[Keputusan] Status dipecah tiga:** run bisa `VERIFIED` tapi `RECORD_FAILED`. Kalau digabung jadi satu enum, info itu hilang. `run.result.status` tetap mengirim `result`, jadi protokol ke frontend tidak berubah.
- **[Keputusan] `owned_cars`:** supaya `/me` tidak perlu memanggil RPC. Keputusan pembelian tetap membaca dari kontrak.

### F3. Endpoint dasar

- [ ] **Login utama Privy + Google** (TECH_SPEC §5.1): setiap endpoint terlindungi dan `/ws/play` menerima access token Privy. Verifikasi ES256 dengan verification key, `iss = privy.io`, `aud = PRIVY_APP_ID`, `exp`. DID baru → baca embedded wallet Ethereum dari `GET /v1/users/{did}` (Basic auth app secret), simpan ke `users.privy_did`. Setelah itu dari DB; ikatan tidak pernah ditimpa dan satu wallet hanya untuk satu DID.
- [ ] Login SIWE hanya kalau `ALLOW_SIWE_LOGIN=true` (bot dan pengembangan):
  - `POST /auth/nonce` → nonce acak 16 byte, berlaku 5 menit.
  - `POST /auth/verify` → `parseSiweMessage`; cek `domain == PUBLIC_ORIGIN host`, `chainId`, nonce ada dan belum kedaluwarsa; `verifySiweMessage`; hapus nonce; upsert `users`; JWT HS256 `{ sub: checksumAddress }` berlaku 12 jam.
- [ ] Alamat selalu disimpan dalam bentuk checksum. Production wajib konfigurasi Privy lengkap.
- [ ] `GET /config` → config + alamat kontrak + `chainId` + explorer.
- [ ] `GET /me` →
  - `coins = SUM(delta)`
  - `coinsReserved = SUM(coin_cost)` untuk reservasi ACTIVE
  - `coinsPending = SUM(coins)` dari `near_misses` dengan `recorded_at IS NULL` dan run yang result-nya bukan INVALID
  - `ownedTiers` dari `owned_cars`, `qualifiedTiers` dari `qualifications`
  - `bestRun` = MAX `near_misses`
- [ ] `GET /health` → `{ ok, chainMode, relayerQueue, activeRuns }`.
- [ ] Format error seragam: `{ error: { code, message } }`.

### F4. `chain/ports.ts` (disepakati dengan Bayu)

```ts
export interface RelayerPort {
  enqueueStart(r: StartRec): void;
  enqueueNearMiss(r: NearMissRec): void;
  enqueueEnd(r: EndRec): void;
  queueSize(): number;
}
export interface VoucherSigner { sign(v: Voucher): Promise<Hex>; }
export type ChainEvent =
  | { type: 'RunStarted'; runId: Hex; seed: Hex; txHash: Hex; blockNumber: bigint }
  | { type: 'NearMiss'; runId: Hex; index: number; vehicleType: 0|1; txHash: Hex; blockNumber: bigint }
  | { type: 'RunEnded'; runId: Hex; txHash: Hex }
  | { type: 'Qualified'; player: Address; tier: number; runId: Hex; txHash: Hex; blockNumber: bigint }
  | { type: 'Purchased'; buyer: Address; tier: number; tokenId: bigint; voucherNonce: bigint; coinCost: number; runId: Hex; txHash: Hex }
  | { type: 'RecordFailed'; runId: Hex; error: string };
```

Pembagian tugasnya: implementasi Bayu cukup memanggil `bus.emit(event)`, dan semua reaksi (ledger, DB, WS) ada di kode backend. `chain/mock.ts` mengeluarkan event ±500 ms setelah enqueue dengan txHash palsu, dan voucher signer mock memakai key lokal.

**Selesai jika:** login Google (Privy) dari frontend berhasil, dan `/me` mengembalikan alamat embedded wallet yang sama dengan di frontend.

---

## G. Fase 5 — Run, `/ws/play`, verifikasi (DH-5), inti backend

### G1. `POST /runs { carTier, roomCode? }`

1. Tolak `ACTIVE_RUN_EXISTS` kalau ada run dengan lifecycle ≠ ENDED; `RUN_LIMIT` kalau sudah ≥ 20 run dalam 1 jam.
2. `carTier > 0` → `chainReads.ownsTier`; kalau tidak dimiliki, `CAR_NOT_OWNED`.
3. Kalau ada `roomCode`: room harus ada (`ROOM_NOT_FOUND`), belum kedaluwarsa (`ROOM_EXPIRED`), pemanggil adalah host-nya (`NOT_ROOM_HOST`), dan tidak sedang ada run (`ROOM_BUSY`). **[Keputusan]**
4. `seedBlock = latest − 3`; `blockhash = getBlock({ blockNumber: seedBlock }).hash`.
5. `runId = keccak256(encodePacked(['address','uint64'], [player, serverNonce]))`, dengan `serverNonce` acak 64-bit.
6. `seed = keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'},{type:'address'}], [blockhash, runId, player]))`.
7. Insert run (`CREATED`, `PENDING`), lalu `relayer.enqueueStart(...)`, buat `RunSession`, dan kalau ada room, broadcast `room.state`.
8. Response: `{ runId, seed, seedBlock, configVersion }`.

### G2. `RunSession`

```ts
class RunSession {
  sim: Sim; runId; address; carTier; roomCode?;
  startAt?: number;
  watermark = 0; lastClientSeq = 0; ord = 0;
  inputs = new Map<number, LogEntry[]>();          // tick → input pemain
  spec = new Map<number, SpecDisruption>();        // warnTick → gangguan penonton (maks 1/tick)
  socket?: WebSocket;
  claim?: RunEndClaim; timeoutTimer?: NodeJS.Timeout;
}
```

### G3. Handler `/ws/play?token=`

- **connect:** verifikasi JWT. Cari session aktif milik address; kalau tidak ada, kirim `error NO_ACTIVE_RUN`. Ganti socket lama dengan yang baru (reconnect). Kirim ulang `disruption.scheduled` yang belum di-ack, urut `sched_order`.
- **`ping`** → `pong { clientMs, serverMs: Date.now() }`.
- **`run.ready`** → kalau lifecycle `CREATED`: `startAt = now + 3000`, lifecycle `READY`, kirim `run.go`, pasang timer timeout di `startAt + 130_000`. Kalau sudah `READY`/`RUNNING` (misalnya karena reconnect): kirim ulang `run.go` dengan `startAt` yang sama.
- **`input {tick, kind, seq}`**:
  - `kind ∈ {1,2,3,4}`, `1 ≤ tick ≤ 3000`
  - `seq ≤ lastClientSeq` → abaikan (duplikat dari kiriman ulang)
  - `tick ≤ watermark` → tambah flag `LATE_INPUT` lalu abaikan
  - kalau valid, simpan ke `inputs[tick]`
- **`watermark {tick}`**:
  - `est = floor((now − startAt) * 30 / 1000)`
  - `tick > est + NET.maxAheadTicks` → `finish(INVALID, flag SPEEDHACK)`
  - selain itu: `watermark = max(watermark, min(tick, 3000))`, lifecycle `RUNNING`, lalu `pump()`
- **`disruption.ack {id, applied}`** → update DB dan memori, lalu `pump()`.
- **`snapshot`** → teruskan ke room sebagai `run.snapshot` dengan throttle 10 Hz. Tidak disimpan.
- **`run.end`** → simpan klaim client.
- **close:** lepas socket saja. Session tetap hidup sampai selesai atau timeout.

### G4. `pump()`

```
while (!sim.ended) {
  const T = sim.tick + 1
  if (T > watermark) break
  const d = spec.get(T)
  if (d && !d.acked) break                         // tunggu ack
  const entries = []
  if (d?.applied) entries.push({ tick: T, kind: SPEC_*, data, seq: 0 })
  entries.push(...(inputs.get(T) ?? []).sort(bySeq))
  const events = sim.step(entries)
  buffer entries dengan ord++ untuk di-insert
  for (const ev of events) handle(ev)
}
flush insert dalam 1 transaksi
```

`handle(ev)`:
- `NEAR_MISS` → insert `near_misses` (`verified_at = now`), kirim `nearMiss.verified` ke pemain, lalu `relayer.enqueueNearMiss({ runId, index, tick, vehicleType, vehicleId, inputHash })`.
- `CRASH` / `RED_ZONE_FAIL` / `TIME_UP` → `finish('VERIFIED', reason)`.

`finish(result, reason)`:
1. Update run: lifecycle `ENDED`, result, end_reason, end_tick, near_misses, final_hash.
2. Kirim `relayer.enqueueEnd({ runId, reason, endTick, totalNearMisses, finalInputHash })`. Untuk run `INVALID` karena speedhack, mepet yang sudah terkirim tetap butuh EndRec supaya run di kontrak ditutup, jadi tetap kirim dengan reason `TIMEOUT`.
3. Hitung `qualifiedTiers` lokal (hanya untuk tampilan cepat; yang resmi tetap event `Qualified`).
4. Kirim `run.result` ke pemain dan room, bandingkan dengan klaim client (`CLAIM_MISMATCH`), hapus timer, lepas session, update room.

### G5. Reaksi terhadap event chain (`chain/bus`)

| Event | Aksi |
|---|---|
| `RunStarted` | seed ≠ DB → result `INVALID`, flag `SEED_MISMATCH`, beri tahu pemain |
| `NearMiss` | isi tx_hash, block_number, recorded_at; `ledger.credit(addr, coins, "runId:index")`; kirim `nearMiss.recorded {latencyMs}` ke pemain dan room |
| `RunEnded` | chain_status `RECORDED` |
| `Qualified` | upsert `qualifications`; kirim `run.qualified` |
| `Purchased` | `ledger.debit(-coinCost, "voucher:nonce")`; reservasi `CONSUMED`; upsert `owned_cars` |
| `RecordFailed` | chain_status `RECORD_FAILED`; beri tahu pemain |

Semua handler harus **idempoten**, karena event bisa terbaca dua kali dari backfill dan subscribe.

### G6. Bot (`scripts/bot.ts`)

- Login SIWE dengan private key dari env (server harus `ALLOW_SIWE_LOGIN=true`), `POST /runs`, buka WS, sinkronkan jam, `run.ready`.
- Jalankan `Sim` lokal dengan langkah tetap 33,33 ms. Kebijakan sederhana: cari kendaraan terdekat di depan, pindah ke lajur sebelahnya, dan hindari lajur yang ada kendaraan di jarak dekat.
- Kirim input dan watermark sesuai protokol, tangani `disruption.scheduled`.
- Akhirnya bandingkan mepet lokal dengan `nearMiss.verified`, lalu cetak PASS/FAIL.
- Mode tambahan: `--speedhack`, `--disconnect 5s`, `--parallel N`.

**Selesai jika:** bot dan frontend menghasilkan mepet yang identik dengan backend; log bot jadi golden fixture.

---

## H. Fase 6 — Integrasi chain bersama Bayu (M2)

- [ ] **Tes pertama sebelum integrasi lain:** kontrak kecil `h(n) = blockhash(n)` di Monad testnet, bandingkan dengan `getBlock(n).hash` untuk 20 blok. Kalau sama, lanjut. Kalau beda, aktifkan `SEED_SOURCE=event`: server menahan `run.go` sampai event `RunStarted` terbaca, lalu memakai seed dari event. Flag ini disiapkan sejak Fase 5.
- [ ] Ganti `CHAIN_MODE=mock` dengan `live` memakai implementasi Bayu.
- [ ] Pastikan `chain_cursor` dipakai untuk backfill dan tidak ada event yang hilang saat server restart.
- [ ] Log median latensi verified → recorded per 20 mepet. Target ≤ 2 detik (PRD §11).
- [ ] Bot `--parallel 5` untuk melihat antrean relayer saat beban tinggi.

---

## I. Fase 7 — Room dan penonton (DH-6)

### I1. REST

- [ ] `POST /rooms` → kode 6 karakter dari `ROOM.alphabet` (ulangi kalau bentrok), `expiresAt = now + 15 menit`. Simpan ke DB dan memori.
- [ ] `GET /rooms/:code` → `{ code, expiresAt, spectators, run }`.

### I2. `/ws/watch?room=&nick=`

- [ ] Tolak kalau room tidak ada atau kedaluwarsa, atau penonton sudah 50. Nick dipotong 16 karakter dan disanitasi; kalau kosong, `Penonton-XXXX`.
- [ ] State per penonton: `{ id, nick, energy, energyTs, bucket }`.
- [ ] Saat join: kirim `room.state` dan `energy`. Broadcast jumlah penonton ke host.
- [ ] Energi dihitung saat dibutuhkan: `energy = min(100, energy + (now − energyTs) * 10 / 1000)`. Kirim `energy` setiap kali berubah karena pemakaian, plus tiap 1 detik.
- [ ] Rate limit 10 pesan/detik per koneksi (token bucket); kelebihan → `disrupt.rejected RATE`.

### I3. Handler `disrupt {kind, lane?, durationIndex?}`

1. Validasi: room belum kedaluwarsa (`ROOM_EXPIRED`), ada session yang `RUNNING` (`NO_RUN`), rate, energi ≥ biaya (`ENERGY`). Payload: lane 0–3 untuk SPIKES/RED, durationIndex 0–2 untuk RED.
2. **[Keputusan] `warnTick` mengikuti posisi client:**
   ```
   warnTick = max(estTick, session.watermark, sim.tick) + NET.disruptionLeadTicks
   ```
   Client boleh lebih cepat sampai 30 tick, sedangkan lead hanya 15. Tanpa `max` ini, gangguan sering jatuh di tick yang sudah lewat. Tolak kalau `warnTick + 60 > 3000`.
3. `canSchedule(limits sim + gangguan penonton pending, ...)`; kalau gagal, `LIMIT`. Karena ada jeda minimal 30 tick, otomatis paling banyak 1 gangguan penonton per tick.
4. Kurangi energi, insert `disruptions` (`sched_order++`), simpan `session.spec.set(warnTick, ...)`.
5. Kirim `disruption.scheduled { id, kind, lanes, durationIndex, warnTick, by: nick }` ke pemain dan semua penonton, lalu `disrupt.accepted { id }` ke pengirim.

Encoding data SPEC: `NITRO → 0`, `SPIKES → lane`, `RED → lane | (durIdx << 8)`.

### I4. Siklus room

- Saat run dimulai atau selesai, broadcast `room.state`. `nearMiss.recorded` dan `run.result` juga diteruskan ke penonton.
- Job tiap 1 menit: hapus room yang kedaluwarsa dan tidak punya run aktif dari memori.

**Test:** `scripts/spectators.ts` dengan 50 koneksi yang spam `disrupt`. Server harus stabil, energi dan batas dipatuhi, dan bot pemain tetap `VERIFIED`.

**Selesai jika:** 3 HP bisa mengganggu satu run, aba-aba muncul 2 detik sebelum aktif, dan mepet tetap cocok.

---

## J. Fase 8 — Ledger dan voucher (DH-7)

- [ ] `ledger.credit` dan `ledger.debit` memakai `INSERT ... ON CONFLICT(ref) DO NOTHING`.
- [ ] `POST /vouchers { tier }`:
  1. `1 ≤ tier ≤ 4`.
  2. Baca **langsung dari kontrak** (spec v1.2): `isQualified` (`NOT_QUALIFIED`), `ownsTier` (`ALREADY_OWNED`), `minted < supply` (`SOLD_OUT`).
  3. Dalam 1 transaksi SQLite:
     - Kalau sudah ada reservasi ACTIVE untuk (address, tier) yang belum kedaluwarsa, **kembalikan voucher yang sama**. **[Keputusan]** Ini mencegah koin tersisih dua kali karena double-click.
     - `balance − reserved ≥ coinCost`; kalau tidak, `INSUFFICIENT_COINS`.
     - `nonce` = uint256 acak, `expiry = now/1000 + 600`.
     - Insert reservasi.
  4. `voucherSigner.sign(...)` dengan domain `RacingGangCars`. Simpan `voucher_json`.
  5. Response `{ voucher, signature, expiresAt }`. `bigint` dikirim sebagai string.
- [ ] Job tiap 30 detik: reservasi ACTIVE yang `expires_at + 60 dtk < now` → `RELEASED`. Margin 60 detik untuk tx yang masuk blok di detik terakhir.
- [ ] Kalau event `Purchased` datang untuk reservasi yang sudah `RELEASED` (kasus tepi), tetap debit dan tandai `CONSUMED`. Event on-chain adalah kebenaran.

**Test:**
- [ ] Beli → koin terpotong tepat sekali, termasuk kalau event diputar dua kali.
- [ ] Voucher kedaluwarsa → koin kembali tersedia.
- [ ] Double-click → satu reservasi.
- [ ] E2E-7: saldo = Σ mepet on-chain × nilai − Σ `coinCost` dari event `Purchased`.

**Selesai jika:** beli Tier 1 di testnet berhasil dan koin terpotong tepat sekali.

---

## K. Fase 9 — P1

**DH-9 Reconnect dan timeout** (sebagian besar sudah ada di G3):
- [ ] Timer `startAt + 130 dtk` → `finish('PARTIAL', TIMEOUT)` pada `sim.tick`.
- [ ] Refresh tab: client baru tidak punya state sim, jadi run berakhir lewat timeout (TECH_SPEC §9).
- [ ] Test: `bot --disconnect 5s` → `VERIFIED`.

**DH-10 Anti-cheat:** 1 run aktif, 20 run/jam, speedhack, `LATE_INPUT`, `CLAIM_MISMATCH`, `SEED_MISMATCH`. Semua flag disimpan sebagai JSON array di `runs.flags`. Test: `bot --speedhack` → `INVALID`.

**DH-11 Endpoint publik:**
- [ ] `GET /runs/:id` → ringkasan, status (3 kolom), mepet + tx_hash + block_number.
- [ ] `GET /runs/:id/log` (hanya setelah ENDED) → `{ runId, seed, seedBlock, player, carTier, configVersion, entries: [{tick, kind, data}] }` urut `ord`. Formatnya langsung masuk ke `replay()`; dicocokkan dengan Bayu untuk halaman audit.
- [ ] `GET /leaderboard?limit=20` → top `near_misses` dari run dengan result `VERIFIED`/`PARTIAL`.

---

## L. Fase 10 — Deploy (DH-8)

- [ ] `backend/Dockerfile`: Node 20 slim, pnpm, copy workspace (`packages/*` + `backend`), install dengan build `better-sqlite3`, jalankan dengan `tsx src/index.ts`. Migrasi otomatis saat start.
- [ ] Volume di `/data`, `DATABASE_URL=/data/racing-gang.db`.
- [ ] Secret hanya di hosting: `JWT_SECRET`, `ATTESTER_PRIVATE_KEY`, `VOUCHER_SIGNER_PRIVATE_KEY`. Sediakan `.env.example` tanpa nilai.
- [ ] CORS ke domain frontend (`PUBLIC_ORIGIN`, juga domain SIWE untuk bot).
- [ ] Isi `PRIVY_APP_ID`, `PRIVY_VERIFICATION_KEY`, `PRIVY_APP_SECRET` sebagai secret hosting; daftarkan domain HTTPS frontend di dashboard Privy.
- [ ] 1 instance, tanpa autoscale; health check ke `/health`.
- [ ] Uji dari HP lewat data seluler: login, WS play, dan WS watch.
- [ ] Logging pino: `runId`, `tick`, latensi relayer, flag anti-cheat.

**Selesai jika:** Definition of Done di TASKS §8 berjalan dari URL publik.

---

## M. Fase 11 — E2E dan demo

- [ ] Jalankan E2E-1 sampai E2E-7 bersama tim. Fokus backend: E2E-4 (gangguan), E2E-5 (reconnect), E2E-7 (saldo).
- [ ] Script `scripts/status.ts`: saldo attester dan voucher signer, panjang antrean relayer, run aktif, room aktif. Dipakai untuk pengecekan pukul 17.00.
- [ ] Akun presenter lulus Tier 1 lewat **permainan manual**, bukan bot.
- [ ] Siapkan RPC cadangan di env, supaya bisa ganti `MONAD_RPC_URL` tanpa ubah kode.

---

## N. Cara kerja git

- Branch `dharu/<fase>`, misalnya `dharu/config`, `dharu/sim-core`, `dharu/server-auth`, `dharu/runs-ws`, `dharu/rooms`, `dharu/vouchers`. PR kecil, merge ke `main` sesering mungkin.
- Perubahan `packages/config` atau `packages/sim` diumumkan ke tim, dan golden fixture dibuat ulang setiap `CONFIG_VERSION` naik.
- Commit hanya atas nama anggota tim, tanpa atribusi AI (TASKS §0 aturan #7).

## O. Perubahan dokumen yang perlu diumumkan ke tim

Hanya dua yang menyentuh orang lain:
1. **§2.1 struktur folder** (`backend/ frontend/ contract/ packages/`). Menyentuh semua orang; sudah diperbarui di TECH_SPEC dan TASKS.
2. **§3.5 typo generator** dan **ID gangguan deterministik**. Menyentuh halaman audit Bayu.

Sisanya internal backend: formula `warnTick`, kolom `ord`, status 3 kolom, `owned_cars`, aturan room kedaluwarsa, dan reuse voucher.

---

## P. Status eksekusi (22 Oktober 2026)

Semua bagian backend yang tidak bergantung pada orang lain sudah selesai dan teruji di CI. Branch bertumpuk: `dharu/sim` → `dharu/server` → `dharu/runs` → `dharu/rooms-vouchers` (yang terakhir berisi semuanya). Belum ada yang di-merge ke `main`.

### P1. Selesai

| Fase | Isi | Bukti |
|---|---|---|
| 1 | Monorepo pnpm, `packages/config`, `protocol.ts`, `cars.json` untuk kontrak | CI cek `cars.json` sinkron |
| 2–3 | `packages/sim` lengkap: PRNG, lalu lintas, tabrakan, mepet, gangguan, NPC, replay, autopilot | 37 test + 3 golden fixture |
| 4 | Fastify, SQLite/Drizzle, **login Privy + Google** (token Privy di REST dan WS, ikatan DID ↔ embedded wallet), SIWE untuk bot, `/me`, `/config`, `/health`, `chain/ports.ts`, mock chain, pembacaan kontrak live | Test auth SIWE + 9 test Privy (token salah, wallet belum siap, Privy mati, klaim wallet ganda, run penuh lewat WS) |
| 5 | `POST /runs`, `/ws/play`, loop verifikasi, anti-speedhack, timeout, pemulihan setelah restart, reaksi event chain | Test + bot lewat jaringan: mepet lokal = backend |
| 7 | `POST/GET /rooms`, `/ws/watch`, energi, batas, rate, `room.state` | Test + 50 penonton × ±3.700 gangguan, run tetap VERIFIED |
| 8 | `POST /vouchers` (EIP-712 `RacingGangCars`), reservasi, pelepasan otomatis | Test alur DoD di mock: main → lulus → voucher → beli |
| 9 | DH-9 reconnect + kirim ulang status mepet, DH-10 flag anti-cheat, DH-11 `GET /runs/:id`, `/runs/:id/log`, `/leaderboard` | Test |
| 10 | `backend/Dockerfile`, `.dockerignore`, smoke test container di CI | CI: `/health` ok, DB di volume `/data` |
| 11 | `scripts/bot.ts`, `scripts/spectators.ts`, `scripts/status.ts` | Dijalankan terhadap server lokal |
| CI | Workspace, Foundry (aktif otomatis), Docker | Hijau di semua branch |

### P2. Belum bisa dikerjakan (terblokir)

| Item | Bagian | Terblokir oleh | Yang dibutuhkan |
|---|---|---|---|
| ~~Tes `blockhash` Monad = hash blok dari RPC~~ | Fase 6 | **Selesai 22 Okt** tanpa wallet: `pnpm --filter @racing-gang/backend check-monad` (eth_call init code `BLOCKHASH`). 7/7 sampel sama, termasuk `latest − 3`, jadi `SEED_SOURCE=local` aman. Jalur cadangan `SEED_SOURCE=event` juga sudah diuji | — |
| `CHAIN_MODE=live`: relayer, indexer, voucher signer | Fase 6, CH-1/2/3 | Bayu | Implementasi `RelayerPort`, indexer yang memanggil `bus.emit`, `VoucherSigner` (lihat `backend/src/chain/ports.ts`). `live.ts` sengaja menolak start sampai ini ada |
| Alamat dan ABI kontrak di `packages/config/deployments/monad-testnet.json` | Fase 6, SC-5 | Bayu | Deploy kontrak ke Monad testnet |
| Test Forge: hash log Solidity = `appendHash` sim | D3 | Bayu | Satu test `forge` dengan input sama dengan test sim |
| Konfirmasi URL explorer resmi | Env | Bayu | `CHAIN_ID` = 10143 sudah terkonfirmasi dari RPC (`eth_chainId`). Waktu blok terukur ±300 ms (PRD menulis ±400 ms), jadi jendela `blockhash` 256 blok ≈ 77 dtk: relayer harus mengirim `RunStart` dalam beberapa detik setelah `POST /runs`. Tinggal `EXPLORER_URL` |
| Latensi on-chain nyata ≤ 2 dtk dan beban relayer di testnet | Fase 6 | Setelah CH-1 | `bot --parallel 5` dengan `CHAIN_MODE=live`. Metriknya sudah ada: `/health.onChainLatency` (median, p90) dan `scripts/status.ts` memberi peringatan kalau median > 2 dtk |
| Audit terhadap event on-chain | AU-1 | Setelah SC-5 | `pnpm --filter @racing-gang/backend audit -- --run <id> --rpc <url> --registry <alamat>`. Logika pembandingnya `auditRun` di `packages/sim`, bisa langsung dipakai halaman audit `/run/:id`. Jalur terhadap catatan backend sudah diuji; jalur event on-chain menunggu kontrak |
| Deploy server publik (HTTPS/WSS, volume, 1 instance) | Fase 10 | Dharu | Akun hosting dan domain. Image sudah siap |
| Uji dari HP lewat internet, 3+ HP | Fase 10–11 | Setelah deploy + frontend | URL publik backend dan frontend |
| Golden test di browser (`/dev/golden`) | D3 | Raka | Sudah dikerjakan di branch `raka/foundation` (`frontend/src/pages/Golden.tsx`); tinggal di-merge |
| Merge `raka/foundation` ke `main` | Repo | Raka / pemilik repo | Sudah diuji di worktree gabungan (22 Okt): satu-satunya konflik `pnpm-lock.yaml` (selesai dengan `pnpm install`); typecheck semua paket, 200 test (frontend 91), dan build frontend lulus. Klien asli frontend (`PlayClient`, `WatchClient`, room/run/summary API) melawan backend asli: room + run + penonton VERIFIED, mepet cocok, semua pesan server lolos validasi frontend; putus 3 dtk tetap VERIFIED |
| Uji login Privy + Google sungguhan | Auth | Dharu + Raka | Backend sudah menerima token Privy (diuji dengan kunci dan server Privy tiruan). Untuk uji nyata: ambil **verification key** dan **app secret** dari dashboard Privy, isi `PRIVY_*` di `backend/.env`, daftarkan origin frontend, lalu login Google dari frontend |
| Konflik `pnpm-lock.yaml` antara branch backend dan `raka/foundation` | Repo | Siapa pun yang merge kedua | Setelah merge, jalankan `pnpm install` lalu commit lockfile baru |
| Review `protocol.ts` dan integrasi frontend | M0, FE-1–FE-8 | Raka | Lihat catatan frontend di P3 |
| E2E-1 sampai E2E-7 | Fase 11 | Tim | Semua item di atas |
| Akun presenter lulus Tier 1 secara manual | Fase 11 | Hari H | Main manual, bukan bot |
| Keputusan balance syarat mepet | PRD §6.2 | Tim | `pnpm --filter @racing-gang/sim stats` (200 seed): Starter p50 55 mepet, 68% run lulus Tier 1 (syarat 40); Tier 1→2 30%, Tier 2→3 6%, Tier 3→4 2%. Autopilot bukan manusia, jadi ini batas atas kasar. Putuskan sebelum kontrak di-deploy (syarat immutable) |
| Merge branch ke `main` dan branch protection | Repo | Dharu | Keputusan pemilik repo |

### P3. Catatan untuk frontend (Raka)

- `run.go` punya field `seed` opsional (mode `SEED_SOURCE=event`); kalau ada, pakai seed itu.
- Setelah reconnect, server mengirim ulang semua `nearMiss.verified` dan `nearMiss.recorded`; hapus duplikat berdasarkan `index`.
- Jangan kirim header `content-type: application/json` tanpa body (mis. `POST /rooms`); Fastify menolaknya dengan 400.
- Jumlah penonton untuk host: polling `GET /rooms/:code`; `room.state` hanya dikirim ke penonton.
- Kode error baru: `RATE_LIMITED`, `INTERNAL`, `RUN_NOT_ENDED`, `WALLET_NOT_READY` (409, embedded wallet belum dibuat), `AUTH_PROVIDER_UNAVAILABLE` (503, server Privy tidak bisa dihubungi).
- `PlayClient` belum memakai `run.go.seed`. Hanya berpengaruh kalau backend terpaksa memakai `SEED_SOURCE=event` (blockhash Monad berbeda dari RPC); kalau terjadi, `PlayClient` harus mengganti sim dengan seed itu sebelum hitung mundur.
- `pnpm install` di gabungan branch memberi peringatan peer dependency Privy (`react` 16–18 vs 19, `viem` 2.56.5 vs 2.57.7). Belum menyebabkan error di test dan build, tapi perlu dicek saat uji login Google sungguhan.
- Setelah reconnect, kalau run sudah selesai saat offline, server mengirim `run.result` (sudah ditangani `PlayClient`).
- Login: kirim access token Privy segar (`getAccessToken()`) sebagai `Authorization: Bearer` di REST dan `?token=` di `/ws/play`, seperti yang sudah dilakukan frontend. Endpoint `/auth/nonce` dan `/auth/verify` tidak ada di production.

### P4. Keterbatasan yang diketahui

- Antrean relayer di mock ada di memori. Relayer live sebaiknya menyimpan antrean di DB: saat restart, backend mengirim ulang mepet dan `EndRec` yang belum tercatat, tapi `RunStart` yang hilang harus ditangani relayer.
- Image Docker belum diuji di laptop (Docker Desktop tidak jalan), tapi lulus build dan smoke test di CI.
