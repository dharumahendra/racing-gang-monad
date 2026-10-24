# T01 — Draft Interface dan Alur Layar Frontend Racing Gang

Tanggal: 21 Oktober 2026. Lingkup: T01 dari `FRONTEND_PLAN.md`, H0–H3. Status: **draft FE siap direview; interface belum disetujui Dharu/Bayu**.

## 1. Keputusan yang sudah tersedia

- Pengguna menetapkan kamera belakang sebagai wajib dan kamera kabin sebagai opsional jika waktu cukup.
- Pengguna mengonfirmasi belum ada update `packages/config`, `packages/sim`, atau ABI; susun usulan terlebih dahulu.
- Source lokal masih berupa dokumen. Tidak ada implementasi, arsip aset, atau fixture golden resmi yang dapat diuji.
- Mobil menggunakan Quaternius Cars Pack yang dipilih pengguna. Model individual untuk Starter/Tier 1–4 belum ditentukan.
- Jalan, landscape, dan dashboard dalam daftar aset masih kandidat. Pemilihan kandidat tidak sama dengan bukti kompatibilitas.
- Logika game tetap dalam sim bersama milik Dharu. Dokumen ini tidak mengubah aturan game atau payload resmi secara sepihak.

Sumber: PRD Draft 1.2; TECH_SPEC Draft 1.2; TASKS Draft 1.2; BACKEND_PLAN 1.0; FRONTEND_PLAN; `Daftar-Asset-Game-Mobil.md`. Daftar aset asli disalin tanpa perubahan sebagai referensi.

Label: **SPEC** = tercantum di sumber; **FE** = keputusan internal FE yang dapat diterapkan; **USULAN** = butuh review pemilik layanan; **TERBUKA** = belum cukup informasi.

## 2. Batas pekerjaan

| Pemilik | Output yang dibutuhkan |
|---|---|
| FE / kamu | Router, UI, renderer, keyboard, adapter sim, koneksi API/WS, lifecycle wallet, halaman hasil, aset dan pengujian browser |
| Dharu | Config dan tipe protokol, bentuk SimView, simulasi, fixture golden, SIWE, REST/WS, room/energi, ledger dan recovery |
| Bayu | ABI/deployment, relayer/indexer/voucher signer, bukti soulbound, komponen audit |

**FE:** kamera, model, pencahayaan, suara dan animasi tidak mengubah hasil `Sim.step()`. Render boleh interpolasi, tetapi input, collision, mepet, warning dan hasil tetap sesuai tick sim. Kamera kabin tidak menambah payload network atau mode simulasi.

## 3. Kontrak data lintas FE–sim

### 3.1 API yang sudah tertulis di SPEC

```ts
type LogEntry = { tick: number; kind: EntryKind; data: number; seq: number };
// LEFT=1, RIGHT=2, BRAKE_ON=3, BRAKE_OFF=4
// SPEC_NITRO=10, SPEC_SPIKES=11, SPEC_RED=12
class Sim {
  constructor(p: { runId: Hex; seed: Hex; carTier: number });
  readonly tick: number;
  readonly ended: boolean;
  readonly inputHash: Hex;
  step(entries: LogEntry[]): SimEvent[];
  view(): SimView;
}
```

SimEvent mengikuti TECH_SPEC §3.2: NEAR_MISS, CRASH, RED_ZONE_FAIL, TIME_UP, SPIKES_HIT, serta DISRUPTION_WARN/ACTIVE/END/DROPPED. FE mengonsumsi event, bukan menebak event dari model 3D.

### 3.2 USULAN bentuk minimum SimView untuk Dharu

Nama di bawah bukan ekspor resmi yang sudah ada. Dharu dapat memilih nama lain; adapter FE menyesuaikan. Readonly menyatakan kontrak tidak boleh dimutasi FE; cara alokasi/snapshot tetap perlu disepakati.

```ts
type Lane = 0 | 1 | 2 | 3;
type VehicleType = 0 | 1; // car / truck
type DisruptionKind = 'NITRO' | 'SPIKES' | 'RED';
type DisruptionView = Readonly<{
  id: string;
  source: 'NPC' | 'SPECTATOR';
  kind: DisruptionKind;
  lanes: readonly Lane[];
  warnTick: number;
  activeTick: number;
  endTick?: number;
  z?: number;
}>;
type SimView = Readonly<{
  tick: number;
  ended: boolean;
  nearMisses: number;
  player: Readonly<{
    x: number; z: number; speed: number; targetLane: Lane;
    braking: boolean; slowTicks: number; nitroActive: boolean;
  }>;
  vehicles: readonly Readonly<{
    id: number; lane: Lane; type: VehicleType; z: number;
  }>[];
  spikes: readonly Readonly<{
    id: string; lane: Lane; z: number; hit: boolean;
  }>[];
  redLanes: readonly Lane[];
  disruptions: readonly DisruptionView[];
}>;
```

Alasan field: player untuk kamera/mesh/HUD; id kendaraan stabil untuk reuse mesh; z kendaraan sudah dalam koordinat dunia sim agar renderer tidak menulis ulang gerak lalu lintas; hit untuk efek rantai; warning memakai rentang tick. `nitroActive` adalah usulan bentuk view, bukan perubahan field internal `nitro` dalam SPEC. Nilai lebar/panjang diambil dari config, tidak diduplikasi di setiap kendaraan.

**Satuan dan aturan FE:** x/z dalam cm; speed cm/tick; 30 tick/detik; km/j = speed ×1,08. Lajur API 0–3, label UI 1–4. Adapter scene mengubah 100 cm menjadi 1 unit visual; arah depan ditentukan satu kali oleh renderer. Model bisa diputar tanpa mengubah koordinat sim. Pada Starter, state awal pemain x=525, z=0, speed=93, targetLane=1. Pilihan isi arrays awal tetap milik implementasi sim.

**TERBUKA:** apakah `view()` membuat snapshot baru atau mereferensikan state mutable? Renderer harus mempertahankan dua snapshot untuk interpolasi; jangan menyimpan referensi lama yang kemudian ikut berubah.

### 3.3 Urutan dan hash

- Input yang dibaca pada tick t diberi tick t+1; LEFT/RIGHT diskret, BRAKE_ON/OFF berpasangan.
- Dalam satu tick: SPEC terlebih dahulu, lalu input pemain urut seq. Jangan mengurutkan hash berdasarkan waktu pesan diterima.
- SPEC_SPIKES.data=lane; SPEC_RED.data=lane | (durationIndex << 8); NITRO.data=0 menurut BACKEND_PLAN.
- `BACKEND_PLAN` memakai seq=0 untuk entri SPEC dan ord terpisah untuk penyimpanan. Dharu/Bayu perlu memberi fixture yang menunjukkan urutan yang benar, termasuk SPEC dan input pada tick yang sama.
- id gangguan di sim dapat berbeda dari ID network: BACKEND_PLAN memakai ID deterministik `n{k}`/`s{warnTick}`. FE menyimpan mapping network untuk ack; tidak memaksa ID backend menjadi ID sim.

## 4. REST: mapping layar, nilai, dan error

SPEC mendefinisikan endpoint, tetapi tidak seluruh shape respons. Jangan menganggap field yang hanya disebut naratif sudah memiliki format JSON final.

| Endpoint | Pemakai FE | Data / perilaku | Status |
|---|---|---|---|
| POST `/auth/nonce` | Connect/login | address → nonce; nonce 5 menit | SPEC |
| POST `/auth/verify` | SIWE | message/signature → token 12 jam | SPEC |
| GET `/config` | Bootstrap semua halaman | konstanta, chain ID, deployment dan explorer; samakan configVersion | SPEC; bentuk envelope terbuka |
| GET `/me` | Garasi, wallet bar | address, coins, coinsPending, coinsReserved, ownedTiers, qualifiedTiers, bestRun | SPEC; shape bestRun dan tier arrays perlu dikunci |
| POST `/rooms` | Host | code, expiresAt | SPEC |
| GET `/rooms/:code` | Host/watch | code, expiresAt, spectators, run | BACKEND_PLAN; shape run sebelum startAt tersedia perlu dikunci |
| POST `/runs` | Solo/host | carTier, roomCode? → runId, seed, seedBlock, configVersion | SPEC |
| GET `/runs/:id` | Result, reconnect, chain resync | lifecycle/result/chainStatus, nearMiss rows/tx | Endpoint SPEC; detail tambahan USULAN §6 |
| POST `/vouchers` | Beli | tier → voucher, signature, expiresAt | SPEC; expiry detik vs expiresAt ms perlu eksplisit |
| GET `/runs/:id/log` | Audit Bayu | log setelah run berakhir | SPEC; P1 |
| GET `/leaderboard` | P1 | ranking | Ditunda dalam scope FE |

Auth endpoint terlindungi mengikuti JWT. **USULAN:** `Authorization: Bearer <token>` untuk REST; WS memakai query token sesuai SPEC. Bentuk header REST belum tertulis eksplisit di sumber dan perlu dikonfirmasi. Domain/URI SIWE mengikuti origin FE yang diizinkan backend; jangan memakai address wallet connect sebagai identitas yang sudah terautentikasi.

Error REST dari BACKEND_PLAN: `{error:{code,message}}`. FE memetakan code ke pesan dan tindakan berikut, bukan membandingkan string message. UNAUTHORIZED → login ulang; ACTIVE_RUN_EXISTS → tampilkan run aktif; CAR_NOT_OWNED → pilih mobil dimiliki; ROOM_NOT_FOUND/EXPIRED/BUSY/NOT_ROOM_HOST → kembali ke room yang valid; INSUFFICIENT_COINS/NOT_QUALIFIED/ALREADY_OWNED/SOLD_OUT → refresh garasi; CHAIN_UNAVAILABLE → status layanan dan retry pembacaan. NOT_QUALIFIED tetap diperiksa kontrak meski tombol Beli aktif.

**USULAN serialisasi:** bytes32/address/txHash sebagai hex string, wei/nonce/blockNumber/seedBlock sebagai string desimal bila berpotensi bigint; tick/index/tier/koin sebagai integer number; waktu server dan expiresAt REST sebagai epoch ms, `voucher.expiry` epoch detik. Perubahan blockNumber menjadi string perlu dikunci di protocol.ts; SPEC belum menetapkan tipe JSON-nya.

## 5. WS: alur yang dipertahankan dan recovery

Semua pesan SPEC berbentuk `{t: '<tipe>', ...payload}`.

### Play

1. Login → POST /runs → buka `/ws/play?token=<JWT>`; server menolak koneksi play tanpa run aktif.
2. Ping/pong untuk offset jam → kirim `run.ready {runId}` → terima `run.go {startAt}`.
3. Hitung mundur sampai startAt; tick 1 pada startAt+1000/30 ms. Jangan memakai now lokal mentah sebagai jam server.
4. Kirim input segera, watermark tiap 100 ms, snapshot 10 Hz. Flush input sebelum watermark yang menutup tick input tersebut.
5. `disruption.scheduled`: jadwalkan SPEC di warnTick bila diterima sebelum warnTick; ack true. Terlambat → ack false. Efek baru aktif 60 tick setelah warnTick; lead network 15 tick bukan durasi warning.
6. nearMiss.verified → pending; nearMiss.recorded → row bukti; run.qualified → kelulusan resmi; run.result → hasil backend.
7. Setelah game lokal berakhir, hentikan step/input, kirim run.end sekali, tetap tunggu hasil dan settlement. Cleanup socket tidak boleh memotong event pencatatan terakhir tanpa jalur REST pengganti.

Duplikasi: dedup nearMiss berdasarkan runId+index; seq per run meningkat dan tidak direset setelah reconnect; keputusan ack pertama dipertahankan per ID. Untuk gangguan yang semula di-ack true tetapi dikirim ulang setelah warnTick, kirim ulang true tanpa menerapkan SPEC kedua kali.

**TERBUKA:** SPEC tidak menyediakan input.ack atau lastClientSeq handshake. BACKEND_PLAN dapat mengabaikan input duplikat berdasarkan seq, sehingga usulan minimum FE adalah menyimpan seluruh input/ack selama run (maksimal 100 detik), kirim ulang berurutan, lalu watermark terbaru. Dharu harus mengonfirmasi dedup tidak membuang input valid dan urutan tidak bergeser. Jangan memasukkan kembali watermark lama sebelum input buffered.

Run berakhir saat offline: session server bisa sudah dilepas. Gunakan GET /runs/:id untuk resync hasil; ERROR NO_ACTIVE_RUN bukan instruksi membuat run baru otomatis. Refresh tab kehilangan state dan berakhir PARTIAL/TIMEOUT, berbeda dari reconnect socket 5 detik.

### Watch dan host

- Penonton memakai `/ws/watch?room=<kode>&nick=<opsional>` tanpa wallet.
- Terima room.state, run.snapshot, disruption.scheduled, energy, disrupt.accepted/rejected, nearMiss.recorded dan run.result sesuai SPEC.
- Kirim disrupt `{kind:'NITRO'}` atau `{kind:'SPIKES',lane:0..3}` atau `{kind:'RED',lane:0..3,durationIndex:0..2}`.
- Energi server adalah nilai resmi. Penolakan ENERGY/LIMIT/NO_RUN/RATE/ROOM_EXPIRED harus terlihat. Accepted bukan jaminan sim akhirnya menerapkan efek; pesan terlambat atau limit bisa membatalkan.
- **FE sementara:** host polling GET /rooms/:code tiap 2 detik saat layar terlihat, hentikan ketika unmount/kedaluwarsa sesuai kebutuhan. Jangan memasukkan host ke koneksi watch karena itu dapat dihitung sebagai penonton dan mendapat energi.
- **TERBUKA:** room.state dapat menampilkan run CREATED sebelum startAt ada; tipe `startAt` perlu nullable atau status READY terpisah. WS watch tidak merinci error room penuh/tidak ada, close code, dan validasi nick; Dharu perlu memberi bentuk respons agar UI tidak menebak.

## 6. Status FE dan usulan ringkasan run

**FE internal:** session UI `idle → creating → connecting → synchronizing → countdown → running → awaitingResult → result`. Koneksi `online/reconnecting/offline`; status chain terpisah dari hasil gameplay.

**SPEC:** result `VERIFIED/PARTIAL/INVALID`; reason TIME_UP/CRASH/RED_ZONE_FAIL/TIMEOUT. **TERBUKA:** di kontrak reason angka 0–3, sedangkan payload WS tidak menentukan angka atau string. Adapter menormalkan ke nama; protocol.ts perlu satu bentuk eksplisit.

**USULAN REST untuk Dharu** (bukan payload resmi baru):

```ts
type RunSummary = {
  runId: Hex;
  lifecycle: 'CREATED' | 'READY' | 'RUNNING' | 'ENDED';
  result: 'VERIFIED' | 'PARTIAL' | 'INVALID' | null;
  chainStatus: 'PENDING' | 'RECORDED' | 'RECORD_FAILED';
  reason: 'TIME_UP' | 'CRASH' | 'RED_ZONE_FAIL' | 'TIMEOUT' | null;
  endTick: number | null;
  nearMisses: number;
  nearMissRecords: {
    index: number; tick: number; vehicleType: 0 | 1; coins: number;
    txHash: Hex | null; blockNumber: string | null;
  }[];
};
```

`coins` pada run.result belum merinci apakah confirmed atau total verified. **FE:** jangan mengubah saldo akun dari field ini; saldo resmi memakai /me. Row record dapat dipakai menghitung pending tampilan per run setelah semantik disepakati.

**TERBUKA — seed fallback:** BACKEND_PLAN H menahan run.go ketika SEED_SOURCE=event, tetapi run.go hanya startAt dan POST /runs sudah mengembalikan seed. FE mengusulkan backend memastikan seed final sebelum POST /runs selesai; jika tidak memungkinkan, tim harus menyepakati respons seed final di endpoint/run.go sebelum membuat Sim. Menambah field run.go adalah perubahan interface dan belum disetujui.

## 7. Wireframe dan state layar

Ini wireframe tekstual untuk implementasi, bukan mockup final. Enam keluarga rute inti mencakup `/watch` dan `/watch/:code` sebagai layar berbeda. `/leaderboard` tetap P1.

### `/` — Garasi desktop

```text
[Racing Gang]                         [Wallet / Login]
[Koin tersedia] [Pending] [Disisihkan]
----------------------------------------------------
| Preview mobil terpilih | Starter T1 T2 T3 T4       |
| low-poly, putar pelan  | statistik + syarat        |
|                       | dimiliki / lulus / stok   |
|                       | [Pilih] atau [Beli]       |
----------------------------------------------------
[Main solo] [Buat room]                  [Jadi penonton]
```

Unauthenticated boleh melihat mobil dan masuk penonton; tindakan pemain meminta login. Status kartu: belum lulus / koin kurang / beli / wallet pending / menyinkronkan / dimiliki / habis. Kartu Starter bukan NFT dan tidak tampil sold out. Receipt sukses menampilkan menunggu /me jika indexer belum menyusul.

### `/play` — Game laptop

```text
[87 dtk] [128 km/j] [Mepet 12/40] [Koin pending +100]
------------------------------------------------------
|                                                    |
|       JALAN 4 LAJUR, KAMERA BELAKANG    | BUKTI     |
|       warning pada area jalan         | #12 blok  |
|       mobil pemain di bawah-tengah    | latensi   |
|                                       | [Lihat tx]|
------------------------------------------------------
[A/D atau panah: lajur] [S/bawah: rem] [Status koneksi]
```

Timer berupa detik tersisa. Countdown 3–2–1 sebelum run. Warning memakai ikon, teks dan bunyi; solid merah hanya saat red zone aktif. Feed bukti tetap terbaca pada proyektor tanpa menutup jalan. Kamera kabin tidak ditampilkan sebagai tombol aktif sampai implementasinya tersedia. Hasil lokal berakhir masuk overlay menunggu backend, bukan langsung saldo final.

### `/room` — Host

```text
[Kembali ke garasi]                      [Wallet]
            KODE ROOM: AB7K2M
            [Salin kode / tautan]
      8 penonton | Kode berlaku 12:34 lagi
          [Mobil dipilih: Starter]
                 [Mulai run]
```

State create/loading/empty/joined/expired/error. Host boleh mulai tanpa penonton; NPC tetap aktif. Room lewat expiry saat run aktif tidak membatalkan run; gangguan baru ditolak server. QR opsional dan belum masuk baseline.

### `/watch` — Join mobile

```text
[Racing Gang]
Ikut ganggu temanmu
[Kode room 6 karakter]
[Nama panggilan (opsional)]
[Masuk room]
```

Normalisasi kode uppercase sesuai alphabet config, nick bukan syarat login. Bedakan kode tidak ada, penuh, kedaluwarsa dan jaringan bermasalah; input tetap dapat diperbaiki.

### `/watch/:code` — Panel penonton mobile

```text
[AB7K2M] [Terhubung]        [8 penonton]
[Waktu: 87 dtk] [Mepet: 12] [Lajur: 2]
[Energi ====================== 80/100]
[Nitro 30]           [Rantai 35]
Pilih lajur: [1] [2] [3] [4]
Red zone: [3 dtk /45] [5 dtk /60] [7 dtk /80]
[Kirim red zone]
Gangguan terbaru / alasan jika ditolak
```

Nitro tidak perlu lajur; Rantai memakai lajur terpilih; Red memakai lajur dan durasi. Bar energi dekat kontrol, target sentuh minimal 44 px, feedback request satu tempat. State no-run menampilkan menunggu host dan tombol nonaktif dengan alasan. Tidak ada peta 2D wajib.

### `/run/:id` — Hasil dan tempat audit

```text
[Run selesai: tabrakan / waktu habis / red zone]
[Mepet terverifikasi] [Koin pending / tercatat]
[Status pencatatan: menunggu / lengkap / bermasalah]
[Daftar bukti transaksi]
[Kelulusan resmi jika event sudah tersedia]
[Main lagi] [Kembali ke garasi]
[Audit run — komponen Bayu bila sudah siap]
```

PARTIAL menjelaskan hanya bagian terverifikasi yang dihitung. INVALID tidak diberi label sah; hasil chain yang sudah ada tetap dibaca sesuai sumber. Run milik orang lain dapat dilihat lewat endpoint publik, tetapi tidak memberi akses memakai mobil/voucher pemiliknya.

### Arah visual FE sementara

Tema: bengkel arcade low-poly yang konsisten dengan mobil Quaternius. Alternatif showroom penuh dekorasi tidak dipilih karena mengalihkan perhatian dari main dan buy. Ciri utama: **empat jalur sebagai indikator navigasi dan warning saat bermain**, bukan panel dashboard generik.

Token awal: asphalt `#243449`, sky `#AFC7DE`, instrument `#F3EBD8`, caution `#DA6A37`, confirmed `#246A5B`, danger `#C83D4C`. Ini arah awal, kombinasi teks/background harus lolos cek kontras saat implementasi. Bahnschrift untuk heading (fallback system sans), Segoe UI/system-ui untuk body, Consolas/monospace untuk angka. Gunakan tabular numbers pada HUD. Tidak memerlukan pembelian atau unduhan font baru.

Kritik internal: jangan membuat seluruh aplikasi hitam-neon hanya karena game balap. Preview mobil cukup pada garasi; saat run hanya HUD dan informasi tindakan. Motion dekoratif tunduk reduced-motion, sedangkan warning kritis tetap punya alternatif teks/ikon/bunyi.

## 8. Pemetaan aset dan dampaknya pada rencana

| Kebutuhan | Referensi | Keputusan / status |
|---|---|---|
| Mobil pemain | Quaternius Cars Pack; preview cars2.jpg | Dipilih pengguna pada level paket; lima model individual menunggu inspeksi archive |
| Mobil lalu lintas | Model dari paket mobil yang sama jika cocok | Usulan reuse; siluet/material membedakan traffic dari player |
| Truk | Belum ada model truk yang terverifikasi dalam daftar | Placeholder balok dulu; cari model terpisah setelah inventory. Jangan mengganti ukuran collision truk mengikuti mobil biasa |
| Jalan 4 lajur lurus | Modular Streets | Kandidat utama. Belum terbukti dimensinya cocok; fallback road mesh prosedural dengan dekor dari paket |
| Landscape samping | Ultimate Nature | Kandidat dekor di luar collision area; subset kecil, bukan seluruh 150 model |
| Rantai / SPIKES | Belum ada model final dalam daftar | Placeholder/prosedural sederhana sesuai ukuran sim; jangan menambah obstacle baru |
| Dashboard | Grab3D Car Dashboard | Opsional; halaman tidak berhasil diakses ulang saat sesi ini, lisensi/archive belum diverifikasi |
| HUD, tombol, warning | Dibangun FE | Bukan gambar tombol dalam paket mobil; komponen HTML/CSS + ikon sederhana |

Halaman pembuat Cars Pack mencantumkan 8 model, format FBX/OBJ/Blend dan CC0: [Quaternius Cars Pack](https://quaternius.com/packs/cars.html). Modular Streets mencantumkan 25 model dengan format dan lisensi serupa: [Modular Streets](https://quaternius.com/packs/modularstreets.html). Nature mencantumkan 150 model, format tersebut dan CC0: [Ultimate Nature](https://quaternius.com/packs/ultimatenature.html). Pengecekan halaman bukan validasi isi archive, integritas model, atau lisensi kandidat lain.

Pipeline yang direncanakan: unduh paket terpilih → inventaris model dan berkas lisensi → pilih lima mobil → konversi model terpilih ke GLB bila diperlukan → cek material/axis/pivot/bounds → normalisasi skala visual → uji loading/browser → catat sumber/lisensi/perubahan di LICENSES.md. File arsip dan scene Blender kerja tidak perlu dikirim ke browser.

Geometri jalan tetap 4 lajur searah; dekor jalan modular tidak otomatis menjadi rute berbelok, junction, atau gameplay kota. Model detail tidak boleh mengubah hitbox config. Suspensi, setir dan roda opsional adalah animasi visual; tidak ada konsep lompat antar-kendaraan.

Kabin opsional hanya dikerjakan jika semua acceptance P0 lulus dan masih ada waktu. Tidak menambah 50 jam. Jika gagal impor/occlusion/performa, kamera belakang tetap target; cabin tidak mengambil buffer yang masih diperlukan untuk perbaikan P0. Anggaran T10 dua jam mengasumsikan aset siap; unduh/konversi awal boleh disiapkan ketika T03 mulai membutuhkan satu model, tetapi placeholder tetap mendahului aset final.

## 9. Fixture dan hal yang harus diuji nanti

`T01_FE_FIXTURES.json` adalah **contoh kontrak sintetis**, bukan run asli, tx nyata, atau golden fixture. Payload yang mengikuti SPEC dipisahkan dari usulan SimView/RunSummary agar field usulan tidak disalahartikan sebagai kesepakatan backend.

Fixture golden resmi tetap harus dihasilkan Dharu: seed/runId/configVersion/log → expectedEvents/finalHash. Jangan mengarang inputHash dan menyebutnya bukti determinisme.

Kasus minimum untuk review:

1. Input RIGHT dan warning SPEC di tick yang sama menghasilkan urutan dan hash identik Node/browser.
2. Warning diterima tepat pada warnTick → ack false; sebelum warnTick → true; reconnect mengulang keputusan awal.
3. VERIFIED + chain PENDING/RECORD_FAILED tampil terpisah; recorded duplikat hanya satu row/satu kredit resmi.
4. Koin confirmed=4.000, reserved=3.000, pending=200 → tersedia 1.000, tidak cukup untuk pembelian 3.000.
5. Receipt sukses tetapi /me belum update → menyinkronkan, tanpa tx kedua.
6. Join watch tanpa wallet; lane UI 1/4 menjadi API 0/3; duration 3/5/7 menjadi 0/1/2.
7. Room.created belum startAt → tidak memulai countdown; expiry saat running tidak mematikan run.
8. Kamera belakang/kabin membaca sim yang sama; mode visual tidak mengubah event atau hash.

## 10. Review checklist untuk Dharu/Bayu

| ID | Pertanyaan / keputusan | Pemilik | Default FE sementara |
|---|---|---|---|
| Q01 | Setujui SimView dan snapshot semantics? | Dharu | Adapter terhadap draft; tidak diterbitkan sebagai paket bersama |
| Q02 | Seed final dikirim kapan bila SEED_SOURCE=event? | Dharu + Bayu | Blok start sampai seed final diketahui |
| Q03 | Setujui tipe JSON bigint, timestamp, reason, bestRun dan tiers? | Dharu | Fixture berlabel usulan; parser tidak menebak format |
| Q04 | GET /runs/:id menyediakan status terpisah dan rows untuk resync? | Dharu | Wajib integrasi hasil/recovery; tidak klaim selesai dengan WS saja |
| Q05 | Host polling sementara dan state run sebelum startAt? | Dharu | Poll 2 detik di foreground, tanpa watch socket host |
| Q06 | Dedup seq/ack dan replay setelah run ENDED? | Dharu | Replay input/ack per run; resync REST |
| Q07 | Error room penuh/tidak ada dan code close WS? | Dharu | UI generic connection error sampai kontrak jelas |
| Q08 | Fixture hash SPEC+input, ABI, deployment, chain config? | Dharu + Bayu | Fixture sintetis dipisahkan dari bukti live |
| Q09 | Semantik coins dan qualifiedTiers pada run.result? | Dharu + Bayu | Saldo /me; qualified resmi dari event/chain |

Belum ada konfirmasi teknis dari Dharu/Bayu, dan dokumen ini belum dikirim kepada mereka. Pengguna dapat meneruskan dokumen ini untuk review. Perubahan protocol.ts/ABI setelah freeze tetap mengikuti aturan tim.

## 11. Hasil tahap pertama dan langkah berikut

- Analisis dan paket usulan T01 tersedia: interface, payload contoh, state, wireframe, aset, serta gap bernama.
- Keputusan pengguna tentang kamera sudah dicatat. Interface freeze lintas tim masih pending review; tidak ditandai selesai secara palsu.
- T02 dapat dimulai pada shell Vite/React/TS, routing dan layout dengan fixture berlabel. Folder packages/config dan packages/sim tetap milik Dharu; FE tidak membuat implementasi tandingan.
- Login nyata membutuhkan server SIWE; scene sim membutuhkan stub/final SimView. Placeholder dan mock hanya sarana pengembangan, bukan acceptance integrasi.
- Belum ada kode aplikasi, unduhan model, transaksi, commit/push, atau deployment yang dilakukan dalam T01.
