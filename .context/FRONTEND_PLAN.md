# Racing Gang — Rencana Frontend 50 Jam

Tanggal analisis: 21 Oktober 2026. Pemilik pekerjaan: kamu sebagai FE developer, disebut Raka dalam dokumen tim. Disusun dengan pendekatan skill `project-planner`.

## 1. Dasar rencana dan kondisi aktual

Seluruh sumber lokal berikut sudah dibaca dan dibandingkan:

| Sumber | Versi | Peran dalam rencana |
|---|---|---|
| `C:\Belajar\Sem5\Momonad\.context\PRD.md` | Draft 1.2 | Perilaku produk, aturan main, ekonomi, target demo |
| `C:\Belajar\Sem5\Momonad\.context\TECH_SPEC.md` | Draft 1.2 | Stack, API simulasi, REST/WS, kontrak, rute FE |
| `C:\Belajar\Sem5\Momonad\.context\TASKS.md` | Draft 1.2 | Ownership, P0/P1/P2, urutan integrasi, acceptance |
| `C:\Belajar\Sem5\Momonad\.context\BACKEND_PLAN.md` | 1.0 | Rincian implementasi Dharu dan keputusan yang berdampak pada FE |

Saat diperiksa, direktori proyek hanya berisi `.git` dan empat dokumen di `.context`. Belum ada `frontend/`, `backend/`, `contract/`, `packages/config`, `packages/sim`, aset, atau dependency manifest. Rencana ini dimulai dari fondasi proyek, bukan melanjutkan aplikasi yang sudah berfungsi. Tidak ada pengujian aplikasi yang dapat dijalankan saat analisis ini.

Angka dan perilaku di bawah bersumber dari dokumen tersebut, bukan verifikasi kondisi jaringan Monad saat ini. Detail chain, ABI, deployment, dan versi dependency harus dikunci bersama tim saat implementasi. Keputusan tambahan di rencana ini adalah usulan FE; tidak otomatis mengubah interface tim yang sudah dibekukan.

**Anggaran:** 50 jam kerja efektif satu FE developer = 40 jam pekerjaan terencana + 10 jam buffer, yaitu 25% dari baseline. Jam Dharu dan Bayu berjalan paralel dan tidak termasuk anggaran FE.

**Asumsi kalender:** H0 adalah awal implementasi. Ini bukan 50 jam kalender atau kerja tanpa jeda. Pada kapasitas 8 jam/hari, dibutuhkan 6 hari penuh + 2 jam. Dokumen menyebut lomba 24 Oktober 2026, sedangkan analisis ini tanggal 21 Oktober: target 50 jam tidak boleh diasumsikan realistis selesai sebelum lomba tanpa penyesuaian scope/kapasitas. Jadwal enam jam hari H dalam TASKS adalah urutan integrasi tim, bukan estimasi seluruh pembangunan FE dari nol.

## 2. Pemahaman produk yang menentukan pekerjaan FE

### Loop utama

Pemain laptop menghubungkan wallet dan login SIWE → memilih mobil → membuat run solo atau room → memainkan balapan maksimal 100 detik → mengumpulkan mepet → melihat hasil verifikasi dan pencatatan on-chain → memenuhi syarat mobil → membeli mobil soulbound dengan koin game dan MON testnet.

Penonton memakai HP atau laptop, masuk menggunakan kode room tanpa wallet, lalu mengirim gangguan menggunakan energi. Penonton ikut memengaruhi run, bukan ikut balapan sebagai mobil kedua.

### Aturan yang harus tercermin di UI

| Area | Aturan sumber | Implikasi FE |
|---|---|---|
| Jalan dan kontrol | 4 lajur; akselerasi otomatis; kiri/kanan dengan panah atau A/D; rem tahan panah bawah/S | Instruksi ringkas sebelum run, tombol tidak menggulir halaman saat game fokus, rem dilepas dengan benar |
| Waktu | Countdown 3 detik; 30 tick/detik; maksimum 3.000 tick | Countdown mengacu `startAt` server; timer game mengacu tick sim |
| Run berakhir | Tabrakan, red zone aktif, atau waktu habis | Akhiri loop tepat sekali; tampilkan alasan dan tunggu hasil resmi backend |
| Mepet | Selesai menyalip dari jarak dekat, kecepatan minimal, tanpa tabrakan; satu kendaraan sekali | Ambil event dari sim; jangan menulis detector mepet sendiri |
| Koin | Mobil +100, truk +200; kredit resmi setelah event on-chain | Bedakan prediksi lokal, pending terverifikasi, dan saldo terkonfirmasi |
| Gangguan | Nitro, SPIKES/rantai, RED; semuanya aba-aba 60 tick sebelum aktif | Isyarat visual, ikon, countdown, suara; jangan hanya bergantung pada warna |
| Nitro | 1,5× kecepatan maksimum selama 3 detik, rem diabaikan | HUD menunjukkan efek dan kondisi rem; fisika tetap milik sim |
| Rantai | Memperlambat dan menahan akselerasi 45 tick | Render objek sesuai state sim, tampilkan efek terkena rantai |
| Red zone | Aktif 3/5/7 detik; overlap badan mobil dengan lajur aktif bisa mengakhiri run | Posisi visual harus cocok dengan batas lajur, termasuk saat pindah lajur |
| NPC | Selalu aktif, termasuk saat solo/offline | FE tidak mengaktifkan NPC hanya ketika tidak ada penonton |
| Room | Kode 6 karakter, berlaku 15 menit, maksimal 50 penonton | Ada state kosong/penuh/kedaluwarsa; expiry tidak menghentikan run yang sedang berjalan |
| Energi | Maksimal 100, regenerasi 10/detik; biaya 30/35/45/60/80 | Nilai resmi dari server; interpolasi bar hanya presentasi |
| Offline | Sim tetap berjalan; input dibuffer; batas pemulihan sampai `startAt + 130 detik` | Tampilkan status koneksi, jangan memberi kesan saldo sudah pasti masuk |
| Refresh | State sim hilang; run lama berakhir timeout/PARTIAL | Jangan menjanjikan resume setelah reload; bedakan dengan reconnect socket |

### Mobil dan syarat

| Tier | Kecepatan tampilan kira-kira | Mepet dalam satu run | Mobil minimal saat memenuhi syarat | Koin | MON testnet | Suplai |
|---|---|---|---|---|---|---|
| Starter | 180 km/j | — | — | Gratis | Gratis | Tak terbatas; bukan NFT |
| 1 | 200 km/j | 40 | Starter | 3.000 | 0,05 | 1.000 |
| 2 | 220 km/j | 75 | Tier 1 | 10.000 | 0,1 | 300 |
| 3 | 245 km/j | 110 | Tier 2 | 25.000 | 0,25 | 100 |
| 4 | 270 km/j | 150 | Tier 3 | 50.000 | 0,5 | 30 |

Nilai implementasi harus diimpor dari `@racing-gang/config`, bukan disalin dari tabel ini. Contoh penting: Starter mencapai 150 mepet tetap hanya memenuhi syarat Tier 1. Target HUD harus memperhatikan `minCarTier`, bukan sekadar mencari ambang mepet berikutnya. Kelulusan yang sudah tercatat tetap berlaku meskipun pemain menabrak setelahnya.

### Tiga lapis status yang tidak boleh dicampur

1. **Lokal:** event `Sim.step()` untuk respons visual cepat. Ini prediksi, bukan saldo resmi.
2. **Terverifikasi:** `nearMiss.verified` berasal dari backend yang menjalankan sim yang sama. Koin masih pending.
3. **Tercatat:** `nearMiss.recorded` berasal dari indexer, membawa tx hash, nomor blok, dan latensi. Ini dasar kredit resmi.

`BACKEND_PLAN` memisahkan lifecycle `CREATED/READY/RUNNING/ENDED`, result `VERIFIED/PARTIAL/INVALID`, dan chain status `PENDING/RECORDED/RECORD_FAILED`. Run bisa VERIFIED sekaligus RECORD_FAILED. Hasil permainan dan keberhasilan pencatatan perlu tampilan terpisah.

Kelulusan resmi berasal dari `Qualified`/pembacaan kontrak. `run.result.qualifiedTiers` dalam rencana backend bisa berupa perhitungan lokal untuk tampilan cepat; jangan menjadikannya bukti resmi bahwa pembelian sudah bisa dilakukan.

## 3. Scope, ownership, dan definisi berhasil

| Pemilik | Tanggung jawab |
|---|---|
| Kamu / FE | `frontend/`: rute, wallet/SIWE, adapter API/WS, renderer R3F, kontrol, HUD, garasi/beli, host, penonton, aset, pengujian browser dan integrasi FE |
| Dharu | Monorepo awal, config/protocol, seluruh logika sim, REST/WS, SIWE server, verifikasi, room/energi, ledger/reservasi, backend hosting |
| Bayu | Kontrak, ABI/deployment, relayer/indexer/voucher signer, verifikasi soulbound, audit replay |
| Bersama | Freeze interface, fixture, testnet integration, diagnosis perbedaan hasil, demo dan keputusan release |

**Target 50 jam:** FE siap demo alur inti dengan backend dan kontrak nyata yang disediakan tim. Jika dependency belum siap, statusnya “FE siap integrasi”, bukan “produk selesai”.

Kriteria selesai utama:

- Login → run → mepet → feed transaksi nyata → kelulusan Tier 1 → beli → kepemilikan diperbarui berjalan bersama layanan live.
- Room dan tiga jenis gangguan bisa digunakan dari minimal 3 HP pada pengujian integrasi. Target demo PRD tetap minimal 10 penonton; pengujian kapasitas 50 koneksi adalah milik backend.
- Aba-aba gangguan berlangsung 60 tick, dengan tampilan dan kontrol yang mudah terbaca.
- Sim lokal dan backend cocok untuk fixture tetap serta run integrasi yang diuji.
- Tidak ada kredit koin atau status pembelian sukses palsu akibat event duplikat, transaksi ditolak, atau indexer terlambat.
- Target scene 60 fps di laptop demo diukur, bukan diasumsikan dari build yang lulus.
- Median verified → recorded ≤2 detik diukur pada integrasi live; ini metrik bersama FE/backend/chain, bukan jaminan yang bisa dipenuhi FE sendiri.
- Build/typecheck dan pengujian penting lulus; bukti, batasan, serta cara menjalankan dicatat.
- Definition of Done produk memerlukan URL publik sesuai TASKS. Rencana ini mencakup persiapan dan verifikasi release; publikasi aktual tetap mengikuti persetujuan/alur tim.

### Prioritas dalam anggaran

**Wajib:** FE-1 sampai FE-9, hasil run sederhana, browser golden fixture, error state utama. Suara aba-aba tetap wajib meskipun suara mesin ditunda.

**P1 yang sengaja dimasukkan:** FE-12 reconnect singkat dan buffer, karena PRD menjelaskan perilaku ini dan demo jaringan berisiko. Jika protokol recovery belum siap, jadwalkan ulang bersama tim dan catat sebagai gap.

**Ditunda:** leaderboard, QR, live 2D penonton, suara mesin/mepet tambahan, tombol khusus “Coba transfer”, animasi dekoratif, model custom kompleks. Audit replay tetap tugas Bayu; FE menyiapkan shell hasil dan tempat integrasi. Pembuktian soulbound tetap dilakukan bersama Bayu meskipun tombol demo ditunda.

## 4. Hal yang harus dikunci pada H0–H3

Dokumen sudah rinci, tetapi beberapa bagian belum cukup untuk implementasi lintas tim. Daftar ini adalah agenda kontrak teknis, bukan permintaan memperluas scope.

| Gap / sumber | Dampak FE | Keputusan yang dibutuhkan | Pemilik |
|---|---|---|---|
| `SimView` hanya dijelaskan secara naratif, TECH_SPEC §3.2 | Renderer bisa dibangun dengan bentuk data yang salah | Tipe final player, kendaraan, warning, red lane, spikes; apakah `view()` menghasilkan snapshot atau referensi mutable | Dharu + FE |
| Urutan SPEC vs input; BACKEND_PLAN memakai `seq: 0` untuk SPEC | Hash/replay bisa berbeda walau layar tampak sama | Fixture bersama mencakup SPEC dan input di tick yang sama; encoding data dan ordering konsisten | Dharu + FE + Bayu |
| Host memerlukan jumlah penonton sebelum ada run, tetapi `/ws/play` mensyaratkan run aktif | Room host tidak punya kanal update yang terdefinisi | Sepakati kanal host; fallback usulan: polling `GET /rooms/:code` dengan interval terkontrol dan cleanup | Dharu + FE |
| `SEED_SOURCE=event`, BACKEND_PLAN H; response awal sudah membawa seed, `run.go` hanya `startAt` | Browser berpotensi menjalankan seed yang berbeda | Bayu tes kesamaan blockhash; jika fallback dipakai, sepakati bagaimana seed final sampai ke FE sebelum Sim dibuat | Bayu + Dharu + FE |
| `RECORD_FAILED` dan lifecycle terpisah, tetapi payload WS belum merinci semuanya | FE bisa menampilkan “berhasil” padahal chain gagal | Kontrak status lewat REST/error WS; prioritaskan ringkasan `GET /runs/:id` meski DH-11 berlabel P1 | Dharu + FE |
| `run.result.qualifiedTiers` bisa hasil hitung lokal | Garasi berpotensi menampilkan kelulusan terlalu dini | Label sementara sampai `run.qualified` atau data kontrak/cache event resmi | Dharu + Bayu + FE |
| `/me` belum memuat sisa suplai | Card mobil tidak bisa menampilkan suplai aktual | FE membaca `minted(tier)` lewat public client menggunakan ABI Bayu; total dari config | Bayu + FE |
| Recovery belum punya ack batas input lengkap / replay event hasil yang terlewat | Duplikasi input, lost result, atau saldo tidak segar setelah reconnect | Aturan seq per run, ack idempoten, resync hasil; ringkasan REST untuk run yang sudah berakhir | Dharu + FE |
| SIWE `PUBLIC_ORIGIN` dan satuan waktu | Login deployment gagal atau countdown/expiry salah | Domain/URI SIWE, chain ID, timestamp ms vs voucher expiry detik; bigint JSON sebagai string | Dharu + Bayu + FE |
| `configVersion` respons vs package browser | Replay dan angka UI tidak cocok | Tolak mulai jika versi tidak didukung; tidak fallback diam-diam ke konstanta lama | Dharu + FE |

Jika belum diputuskan pada H3, tulis asumsi eksplisit dan fixture adapter untuk melanjutkan UI. Mock tidak dihitung sebagai validasi integrasi. Jangan membuat implementasi aturan game tandingan untuk mengisi paket sim yang belum tersedia.

## 5. Rencana pekerjaan: 40 jam baseline + 10 jam buffer

Semua task berukuran 2–6 jam dan dimiliki satu orang, FE. Jam berikut adalah baseline berurutan. Jika buffer dipakai lebih awal, posisi task berikutnya bergeser; batas total tetap H50.

| ID | Jendela | Jam | Pekerjaan dan referensi | Dependensi | Selesai jika |
|---|---|---:|---|---|---|
| T01 | H0–H3 | 3 | Freeze tipe integrasi, daftar state, wireframe sederhana enam rute; selesaikan agenda §4 | Dharu/Bayu tersedia untuk kontrak | Ada tipe/fixture yang disepakati atau gap bernama; mapping API, field, owner, dan layar jelas |
| T02 | H3–H6 | 3 | Fondasi Vite/React/TS, routing, state store, config/env; connect wallet dan SIWE (FE-1) | T01, DH-1, DH-4 | Bisa login nyata atau mock berlabel; salah chain, signature ditolak, JWT habis, ganti akun ditangani; live login tetap gate |
| T03 | H6–H12 | 6 | R3F jalan 4 lajur, kamera chase, placeholder player/traffic, fixed step, interpolasi, keyboard; `/dev/golden` (FE-2) | T02, stub lalu sim inti DH-2 | Input tick+1, loop 30 Hz, hasil fixture browser cocok Node; render tidak mengubah sim; tidak `step()` setelah ended |
| T04 | H12–H17 | 5 | WS play, offset jam, create/ready/go, input/seq, watermark, snapshot, ack gangguan, result (FE-4) | T03, DH-5, protocol final | Run lokal vs backend cocok; countdown berdasar server; input terkirim sebelum watermark yang mencakupnya; ack tepat waktu/terlambat diuji |
| T05 | H17–H21 | 4 | HUD, warning 2 detik + suara, efek gangguan, layar hasil, feed on-chain (FE-3/FE-5) | T03–T04, DH-3, CH-2 | Local/verified/recorded terpisah, feed dedup, tx link benar, warning 60 tick, result menampilkan alasan dan status chain |
| T06 | H21–H25 | 4 | Garasi 5 tier, status dan suplai, reservasi/voucher, `buy()`, receipt dan refresh (FE-6) | T02, DH-7, SC-5, CH-2/CH-3 | Tier 1 terbeli di testnet saat layanan tersedia; reject/revert/expiry/lag dipahami UI; tidak memotong saldo lokal sebagai saldo resmi |
| T07 | H25–H27 | 2 | Host room, kode besar, expiry, jumlah penonton, mulai run (FE-7) | T02, T04, DH-6, keputusan kanal host | Kode terbaca, jumlah penonton update, run memakai room milik host, expiry tidak mematikan run aktif |
| T08 | H27–H31 | 4 | `/watch` dan `/watch/:code` mobile-first: join, energi, lane, durasi, tiga gangguan, status/feed (FE-8) | T07, DH-6 | Tanpa wallet; 3 HP bisa join dan mengirim; semua alasan penolakan utama tampil; lajur UI 1–4 dipetakan ke API 0–3 |
| T09 | H31–H33 | 2 | Reconnect dan buffer terurut; resync result setelah run berakhir (FE-12) | T04, DH-9, kontrak recovery | Putus 5 detik → sim lanjut → reconnect tanpa input/gangguan ganda; reload diperlakukan berbeda |
| T10 | H33–H35 | 2 | Aset final sederhana, `LICENSES.md`, ukur/render tuning laptop demo, cek layout HP (FE-9) | T03, T05, T08, aset siap | Tiap aset punya sumber/lisensi; lima tier bisa dibedakan; FPS diukur dengan scene ramai; HUD tetap terbaca |
| T11 | H35–H38 | 3 | QA lintas alur, browser + perangkat nyata, live testnet, error utama, pembuktian saldo/soulbound bersama tim | T05–T10, backend/chain live | Checklist §9 berisi bukti PASS/FAIL/BLOCKED; masalah kritis ditriase; test stub tidak diberi label live |
| T12 | H38–H40 | 2 | Persiapan release, README/env, runbook demo, video cadangan, handoff audit Bayu | T11, URL backend/hosting tim | Kandidat release dan langkah verifikasi siap; jika release disetujui, URL publik diuji; demo cadangan dan gap tercatat |
| B01 | Reserve | 5 | Buffer perbaikan integrasi: seed, seq/hash, WS recovery, ABI/indexer | Dipakai pada gate yang gagal | Blocker inti diperbaiki dan kasus yang gagal diuji ulang; jam pemakaian dicatat |
| B02 | Reserve | 5 | Buffer QA, perangkat, performa, release, gladi dan retest | Sisa masalah setelah integrasi | Bukti akhir konsisten; tidak ada bug kritis terbuka untuk alur demo |
| **Total** | **H0–H50 maksimum** | **50** | **40 terencana + 10 buffer** | | |

Pekerjaan test dimulai dalam masing-masing task. T11 adalah uji lintas sistem, bukan pertama kali menguji seluruh hasil. Dua jam T10 mengasumsikan aset sederhana tersedia; pemodelan 3D custom tidak masuk anggaran. Dua jam T12 mengasumsikan akses hosting dan backend telah disiapkan pemiliknya.

### Estimasi ketidakpastian

Estimasi penilaian untuk paket kerja inti: optimistis 34 jam, paling mungkin 40 jam, pesimistis 60 jam. Estimasi tiga titik `(34 + 4×40 + 60) / 6 = 42,3 jam`. Anggaran tetap 50 jam, bukan 42,3 + 10; buffer 10 jam dialokasikan dari baseline 40 jam. Ini perkiraan awal, bukan hasil pengukuran produktivitas.

Kondisi mendekati 40 jam: sim dan protokol stabil, aset sederhana, akses testnet siap, serta Dharu/Bayu mengirim integrasi tepat waktu. Kondisi mendekati 60 jam: seed/protokol berubah, recovery perlu didesain ulang, backend belum live, atau tuntutan visual meningkat. Waktu menunggu pihak lain dapat memperpanjang kalender walau jam kerja FE belum habis.

## 6. Milestone dan gate integrasi

| Milestone FE | Baseline | Pemilik | Bukti / gate |
|---|---|---|---|
| F0 — Kontrak FE jelas | H3 | FE; review Dharu/Bayu | Tipe `SimView`, payload, error, status, fixture dan daftar gap |
| F1 — Game lokal berjalan | H12 | FE | Kontrol, 4 lajur, loop tetap, browser golden PASS setelah sim final tersedia |
| F2 — Run dan bukti live | H21 | FE; layanan Dharu/Bayu | Local = verified, warning benar, feed memakai transaksi nyata |
| F3 — Ekonomi end-to-end | H25 | FE; layanan Dharu/Bayu | Kualifikasi resmi, voucher, tx beli, kepemilikan dan saldo tersinkron |
| F4 — Penonton masuk loop | H31 | FE; layanan Dharu | 3 HP, tiga gangguan, energi/penolakan, room expiry |
| F5 — Kandidat release | H40 | FE; review tim | QA, recovery, aset/lisensi, runbook dan daftar bug |
| F6 — Penutupan buffer | ≤H50 | FE; tim untuk E2E | Retest masalah, bukti demo; jika dependency gagal, tandai blocked pada integrasi terkait |

Check-in singkat dengan tim di H0, H3, H12, H21, H31, dan H40. Masing-masing hanya membahas bukti terakhir, blocker, owner, serta perkiraan jam berikutnya. Waktu koordinasi termasuk task, bukan tambahan di luar 50 jam.

## 7. Dependensi, jalur kritis, dan permintaan ke tim

Jalur game: T01 → T02 → T03 → T04 → T05 → T11 → T12.

Cabang pembelian: config/ABI + SIWE + ledger/voucher + kontrak → T06 → T11.

Cabang penonton: DH-3/DH-6 + T04 → T07 → T08 → T11.

Cabang pemulihan: kontrak recovery DH-9 + T04 → T09 → T11.

Semua cabang bergabung di QA. Dengan satu FE developer, diagram ketergantungan bukan izin mengerjakan beberapa task penuh secara bersamaan; tugas independen bisa ditukar urutannya ketika menunggu layanan.

| Siapa | Dibutuhkan | Batas kesiapan relatif FE | Jika terlambat |
|---|---|---|---|
| Dharu | Config, tipe protokol, stub `SimView`, contoh pesan | H3; stub diupayakan 30 menit pertama sesuai TASKS | Kerjakan shell/layout dengan fixture; jangan klaim game terintegrasi |
| Dharu | SIWE, `/config`, `/me` | H6 | UI auth memakai mock berlabel, live login tetap blocker F3 |
| Dharu | Sim inti + NPC + golden fixtures | Inti H12; gangguan sebelum H17 | Renderer bisa lanjut; parity dan warning belum lulus |
| Dharu | `/runs`, WS play dan error/status/resync | H12 | Alihkan sementara ke garasi/penonton statis; T04 tetap blocker |
| Bayu + Dharu | Deployment/ABI dan feed `nearMiss.recorded` live | H17 | Uji reducer dengan fixture; F2 tidak dinyatakan selesai live |
| Bayu + Dharu | Voucher signer, ledger/reservasi, kontrak buy | H21 | UI state pembelian bisa diuji; pembelian nyata tetap blocker |
| Dharu | Room/WS watch dan update host | H25 | Layout watch bisa lanjut; E2E gangguan tetap blocker |
| Dharu | Recovery dan ringkasan run | H31 | Jangan menjanjikan reconnect berhasil; gunakan buffer atau turunkan scope secara eksplisit |
| Dharu + Bayu | Backend HTTPS/WSS, chain live, wallet presenter berisi MON | Sebelum H35 | QA sistem belum bisa lulus; FE hanya siap integrasi |
| Bayu | Audit component dan bukti soulbound | Audit sebelum handoff jika P1 siap; soulbound saat QA | Audit boleh ditunda, pembuktian sifat NFT tetap dicatat bersama |

Ini target handoff yang diusulkan, bukan janji kesiapan dari anggota tim. Belum ada pesan yang dikirim ke mereka.

## 8. Panduan implementasi FE yang menjaga konsistensi

### Struktur yang disarankan

Semua path di bawah merupakan usulan, belum dibuat:

```text
frontend/src/
  app/                 router, providers, shared layout
  lib/                 config, api, wallet, formatting
  features/auth/       SIWE, account lifecycle
  features/game/       Sim adapter, fixed-step runner, input queue, R3F scene
  features/run/        session, play socket, HUD, feed, result
  features/garage/     car cards, eligibility display, purchase state
  features/room/       host controls, room status
  features/watch/      anonymous join, energy, disruption controls
  features/audit/      shell/entry integration milik Bayu
  dev/                 golden fixture browser, hanya development
```

Tipe protokol dan konstanta berasal dari `@racing-gang/config`. Sim berasal dari `@racing-gang/sim`. Gunakan stack yang sudah dipilih dokumen: Vite, React, TypeScript, R3F/three.js, wagmi/viem, zustand. Kunci versi yang kompatibel saat setup, tanpa mengubah stack selama anggaran ini.

### Game dan input

- R3F membaca snapshot sim; animasi visual boleh memakai float, sedangkan aturan sim tetap integer.
- Akumulator memakai interval konseptual `1000/30`, bukan pembulatan 33 ms yang menimbulkan drift. Render menginterpolasi state sebelumnya dan sekarang; snapshot sebelumnya tidak boleh ikut termutasi.
- Kecepatan HUD = `speed × 1,08` km/j. Skala cm sim ke unit scene didefinisikan sekali di adapter renderer.
- `keydown` kiri/kanan menghasilkan input diskret; tentukan perlakuan key-repeat. Rem `keydown/keyup` mengirim ON/OFF. Kehilangan fokus harus mencegah rem tersangkut dan mengirim input pelepasan secara konsisten.
- Jangan mengubah state game berdasarkan FPS atau mengimplementasikan ulang tabrakan, RNG, mepet, NPC, dan hitungan koin resmi.
- Tab background dapat membatasi timer browser. Uji lalu sepakati kebijakan catch-up dengan backend; tidak boleh membuang tick atau membuat watermark melampaui waktu yang diizinkan secara diam-diam.

### Protokol realtime dan reconnect

- Satu session manager menangani socket, queue dan cleanup; navigasi/React lifecycle tidak boleh membuat listener atau koneksi ganda.
- `POST /runs` dilakukan sebelum WS play karena server mencari session aktif. Sinkronkan waktu dengan ping/pong sebelum countdown; reconnect memakai `startAt` yang sama.
- `input` diberi tick berikutnya dan seq meningkat per run. Kirim input sebelum watermark yang menutup tick tersebut. Watermark 100 ms, snapshot 10 Hz sesuai config.
- Warning penonton mulai pada `warnTick`; aktivasi pada `warnTick + 60`. Lead jaringan 15 tick bukan durasi aba-aba. Ack true hanya saat pesan baru diterima sebelum warnTick.
- Untuk pesan gangguan duplikat setelah reconnect, simpan keputusan ack pertama berdasarkan ID. Kirim ulang keputusan yang sama; jangan menjadwalkan ulang atau membalik true menjadi false hanya karena tick sekarang sudah lewat.
- Sim lokal memakai urutan SPEC dahulu, lalu input, sama seperti backend. Hash final tidak boleh disusun dengan urutan kedatangan socket.
- Setelah reconnect, flush input/ack buffered dengan urutan yang disepakati sebelum watermark terbaru; jangan reset seq atau membuat run baru otomatis.
- Indexer bisa selesai setelah gameplay berakhir. Feed dedup berdasarkan runId + index dan tetap direkonsiliasi pada hasil. Karena beberapa pesan tidak membawa runId, kaitkan dengan session yang benar dan bersihkan listener run lama.
- Jika socket kembali ketika run sudah ENDED dan session server sudah dilepas, ambil ringkasan melalui REST; jangan terus menunggu `run.result` yang tidak direplay.

### Garasi, saldo, dan transaksi

- Tampilkan `coins`, `coinsPending`, `coinsReserved`; jumlah tersedia untuk belanja = `coins − coinsReserved`. Pending tidak ikut jumlah yang dapat dibelanjakan.
- Status kartu: belum lulus, lulus tetapi koin kurang, tersedia untuk dibeli, sedang proses, dimiliki, atau suplai habis. Card Starter tidak menampilkan stok habis karena `supply=0` berarti tidak terbatas.
- Wallet connect belum berarti login. Token harus terkait address yang menandatangani SIWE. Ganti account/chain membatalkan session UI yang tidak sesuai dan membersihkan cache/voucher akun lama.
- Purchase state: meminta voucher → konfirmasi wallet → transaksi pending → receipt sukses → menunggu sinkronisasi backend → dimiliki. Bedakan user rejected, revert, expired dan kegagalan jaringan.
- Voucher nonce/field bigint diterima sebagai string lalu dikonversi aman; harga MON dikonversi menjadi wei tanpa floating point.
- Double-click tidak membuat transaksi ganda. Setelah hash transaksi diketahui, lanjutkan cek transaksi tersebut saat RPC lambat; jangan otomatis mengirim `buy()` lagi.
- Receipt sukses bisa mendahului update `/me`. Refresh terkontrol sampai indexer menyusul, dengan status “menyinkronkan”; jangan mengubah saldo resmi secara spekulatif.
- Pembelian gagal tidak berarti reservasi langsung bebas. BACKEND_PLAN melepasnya setelah expiry dengan margin 60 detik dan job berkala; tampilkan status server, bukan janji pengembalian instan.

### Penonton dan batas otoritas

- `/watch` tetap publik, tanpa wallet. Form dan tombol diuji untuk satu tangan; status energi dan penolakan dapat dibaca tanpa melihat warna saja.
- UI lajur 1–4 harus dikonversi ke API 0–3. Red duration 3/5/7 detik dikonversi ke index 0/1/2.
- `disrupt.accepted` berarti diterima server, bukan jaminan efek akhirnya aktif: client dapat terlambat atau sim membatalkan karena batas. Feedback tidak boleh menyamakan dua keadaan itu.
- Kendali energi, kepemilikan room/mobil, identitas pembeli dan kelulusan tetap ditegakkan server/kontrak. Disabled button membantu UX, bukan bukti kontrol akses.

## 9. Rencana verifikasi dan bukti

Test unit/integration FE difokuskan pada queue/ordering/dedup, status saldo/purchase, dan lifecycle session. Browser nyata diperlukan untuk R3F, WebGL, input, wallet, audio, dan performa; jsdom saja tidak membuktikan hasilnya.

| Area | Skenario | Bukti yang disimpan | Penanggung jawab |
|---|---|---|---|
| Fondasi | Install, typecheck, build, routing langsung termasuk `/watch/:code` | Command dan hasil aktual; deep-link smoke test | FE |
| Auth | SIWE sukses, signature ditolak, chain salah, token expired, ganti akun A→B | Langkah reproduksi dan UI; data/voucher A tidak muncul pada B | FE + Dharu untuk enforcement |
| Sim | Fixture seed/log sama, SPEC dan input satu tick, tabrakan/mepet/timeout | `/dev/golden` PASS/FAIL, jumlah dan hash dibanding Node | FE + Dharu |
| Netcode | Input tick+1, watermark tertib, ack tepat waktu/terlambat, pesan duplikat | Log sequence tanpa token; daftar event lokal vs backend | FE + Dharu |
| Gangguan | Warning 60 tick; nitro mengabaikan rem; rantai; red overlap saat aktif | Rekaman/observasi browser dan nilai tick | FE + Dharu |
| Feed | Verified belum recorded, duplicate recorded, event setelah result, chain gagal | Row feed unik, status koin tepat, tx hash nyata saat live | FE + Bayu/Dharu |
| Pembelian | Jalur sukses, wrong chain, reject, revert, voucher expired, klik ganda, indexer lambat | Tx hash/receipt, `/me` sebelum/sesudah, satu debit | FE + Dharu + Bayu |
| Room | Tanpa wallet, kode salah, room penuh/expired, tidak ada run, energi kurang, rate/limit | 3 HP; error bisa dipahami; run aktif tidak berhenti saat expiry | FE + Dharu |
| Offline | Putus 5 detik, reconnect, ack duplicate, run selesai saat putus, refresh | Parity dan status result; tidak ada input/efek ganda | FE + Dharu |
| Otorisasi integrasi | B memakai room/voucher A, memilih mobil tak dimiliki, memanggil endpoint terlindungi tanpa auth | Penolakan nyata dari server/contract; bukan screenshot tombol disabled | Dharu/Bayu, FE memastikan UI menangani |
| Performa/aksesibilitas | Run ramai pada laptop demo; halaman watch HP; keyboard; suara dibuka lewat user gesture | FPS/frame-time pada perangkat tercatat; tanpa scroll tak sengaja/overflow | FE |
| Demo | E2E-1/2/3/4/7; E2E-5 untuk reconnect; E2E-6 jika audit Bayu siap | Rekaman, tx, hasil saldo, bukti soulbound, daftar gap | Tim |

Acceptance demo menguji setidaknya satu run sampai hasil, satu pembelian nyata, dan tiga gangguan penonton. Target 10 penonton PRD diuji bersama jika peserta tersedia; jika baru 3 HP, tulis “3 perangkat teruji”, bukan klaim kapasitas 50.

Aktivitas pembelian dan deployment dilaksanakan saat tahap implementasi dengan wallet/testnet dan otorisasi tim yang sesuai. Penyusunan rencana ini tidak mengeksekusi transaksi atau publikasi.

## 10. Risiko dan tindakan

| Risiko | Dampak | Peluang penilaian | Mitigasi / pemicu tindakan |
|---|---|---|---|
| Belum ada implementasi bersama | Tinggi | Tinggi | Gate H3/H12; stub dan fixture dari Dharu, kerjakan task UI independen saat tertahan |
| Seed/urutan hash tidak sama | Tinggi | Sedang | Putuskan fallback seed awal; golden lintas Node/browser, termasuk SPEC di tick sama |
| UI terlihat sukses sebelum chain/indexer | Tinggi | Tinggi | Pisahkan result/chain status; receipt dan indeks event direkonsiliasi |
| Netcode offline memakan waktu >2 jam | Tinggi | Sedang–tinggi | Fondasi queue sejak T04; B01 untuk recovery; jangan klaim offline lengkap tanpa tes |
| Aset/efek berat membuat FPS turun | Tinggi | Sedang | Placeholder dulu, model sederhana, batasi efek, ukur laptop demo di T03 dan T10 |
| Wallet, SIWE origin, HTTPS/WSS belum cocok | Tinggi | Sedang | Test domain target lebih awal; env disepakati sebelum QA |
| Tier 1 sulit dicapai saat demo | Tinggi | Sedang | Playtest dini; akun presenter lulus lewat permainan manual sebelumnya; jangan ubah angka di FE sendiri |
| P1 dan visual polish menghabiskan buffer | Sedang | Tinggi | Freeze fitur setelah F4; buffer untuk P0 dan retest |
| Target 50 jam disamakan dengan sisa waktu sebelum lomba | Tinggi | Tinggi | Pisahkan jam efektif dan kalender; rebaseline scope jika deadline tetap 24 Oktober |

### Aturan pemotongan scope

Ikuti urutan TASKS: leaderboard → QR → live 2D penonton → audit → reconnect/offline → variasi NPC dua lajur. Rencana ini sejak awal tidak mengalokasikan empat item pertama sebagai implementasi inti FE. Reconnect dapat diturunkan hanya dengan keputusan tim karena mengubah janji produk. Mengurangi NPC dua lajur adalah perubahan sim/config milik Dharu, tidak dilakukan hanya pada renderer.

Yang tetap dijaga: mepet on-chain, pembelian soulbound, dan penonton dengan tiga jenis gangguan. Jika setelah buffer habis ketiganya belum berjalan bersama layanan nyata, laporkan bagian yang blocked; jangan mengganti transaksi/feed asli dengan mock untuk menyatakan selesai.

## 11. Pelacakan dan handoff

Gunakan checklist T01–T12/B01–B02 dengan kolom: status (`TODO`, `DOING`, `BLOCKED`, `DONE`), planned hours, actual hours, sisa estimasi, dependency owner, evidence. Task menjadi DONE setelah kriterianya terbukti. Jika hanya fixture yang lulus, catat bagian live sebagai blocked.

Branch mengikuti konvensi repo `raka/*`, misalnya `raka/foundation`, `raka/game-loop`, `raka/realtime`, `raka/garage`, `raka/watch`. Commit kecil dan scoped; integrasikan ke basis tim secara berkala. Config/sim/ABI berubah melalui koordinasi tim. Ikuti TASKS: riwayat commit hanya anggota tim, tanpa atribusi contributor AI.

Handoff akhir berisi:

- Cara menjalankan FE dan kebutuhan workspace bersama.
- `.env.example` tanpa secret; frontend hanya menggunakan alamat/URL/config publik.
- Peta rute, interface yang dipakai, dan keputusan penyelesaian gap §4.
- Sumber dan lisensi aset.
- Checklist test dengan bukti nyata dan keterbatasannya.
- Langkah demo: room → run → mepet tercatat → Qualified → buy → soulbound; audit jika siap.
- Video cadangan serta daftar isu tersisa dengan owner.

**Langkah pertama implementasi:** kunci `SimView`, tipe REST/WS dan fixture bersama Dharu/Bayu, lalu bangun fondasi dan scene placeholder. Detail aset final dikerjakan setelah loop permainan dan integrasi terbukti.

## 12. Pembaruan T01 — 21 Oktober 2026

- Pengguna memberikan daftar aset `Daftar-Asset-Game-Mobil.md`; referensi ini ditambahkan ke `.context` tanpa mengubah sumber aslinya.
- Keputusan pengguna: kamera belakang wajib; kamera kabin hanya jika waktu cukup. Cabin opsional tidak menambah anggaran 50 jam dan tidak mengambil waktu perbaikan P0.
- Pengguna mengonfirmasi belum ada update packages/config, packages/sim atau ABI. T01 menghasilkan usulan untuk review, bukan interface yang sudah disetujui tim.
- Output T01: `T01_FE_HANDOFF.md` (kontrak data, REST/WS, state, wireframe, pemetaan aset, gap/owner) dan `T01_FE_FIXTURES.json` (contoh sintetis, bukan golden fixture atau transaksi nyata).
- Status T01: analisis dan draft FE tersedia; freeze lintas tim menunggu review Dharu/Bayu. T02 boleh mulai pada shell/routing/fixture; integrasi nyata masih membutuhkan paket dan layanan bersama.
- Cars Pack sudah dipilih pada tingkat paket; lima model individual belum dipilih. Jalan, nature dan dashboard tetap kandidat. Truk dan SPIKES belum mempunyai aset final terverifikasi.
- Tidak ada kode aplikasi atau perubahan aturan game yang dibuat pada tahap ini. Jam pada tabel tetap estimasi; tidak diklaim sebagai timesheet aktual.

## 13. Pembaruan T02 — 22 Oktober 2026

- Basis tim diperbarui: branch `raka/foundation` dibuat dari `origin/main` commit `e814b30`, yang sudah memuat workspace, `packages/config`, protokol, `packages/sim`, dan golden fixtures Dharu. Draft tipe T01 adalah catatan historis; ekspor source bersama sekarang menjadi acuan implementasi.
- Fondasi ada di `frontend/`: Vite/React/TS, routing, layout responsif, preview garasi, form/panel penonton, shell play/host/hasil, wagmi injected, zustand session, adapter REST SIWE, README dan env example.
- Angka mobil berasal dari config bersama. Saldo contoh diberi label; tidak ada run, room, transaksi, atau login mock palsu.
- Source dan dependency sudah disimpan di proyek Momonad. Typecheck, 11 test FE, build dan pemeriksaan browser juga lulus langsung di lokasi proyek final.
- Browser: desktop 1440×1000, HP 390×844, 9 kelompok pemeriksaan PASS, console tanpa error/warning. Model mobil masih ilustrasi CSS, bukan aset Quaternius final.
- Semua typecheck workspace lulus. Total unit yang dijalankan: 57 PASS dan 1 FAIL bawaan guard sim terhadap komentar berakhiran CRLF; golden replay tetap PASS. Shared sim tidak diubah. Detail reproduksi di `T02_IMPLEMENTATION.md`.
- Status T02: fondasi FE dan adapter tersedia; validasi login SIWE nyata menunggu backend aktif. Belum ada bukti enforcement server/kontrak, transaksi testnet, WS atau game 3D.
- Berikutnya T03: runner sim 30 Hz, input tick+1, interpolasi, golden browser, dan placeholder R3F dengan kamera belakang. Kamera kabin tetap opsional.
- Laporan dan batasan ada di `T02_IMPLEMENTATION.md`. Tidak ada commit/push/deployment atau pesan kepada tim.

## 14. Pembaruan T03 dan keputusan Privy — 22 Oktober 2026

- T03 lokal tersedia: R3F dengan kamera belakang, sim 30 Hz, input tick+1, interpolasi, countdown, keyboard, HUD dan hasil latihan. Shared config/sim tidak diubah. Ranked, saldo dan qualification resmi tidak diberikan dari latihan.
- Aset mobil asli didahulukan sesuai arahan pengguna: lima model Quaternius untuk tier garasi serta Taxi/Cop untuk traffic. GLB, manifest dan lisensi CC0 tersimpan di frontend. Jalan/nature masih geometri sederhana dari kode; kabin belum dibuat. Sebagian pekerjaan aset T10 sudah maju, tetapi ukur performa laptop demo tetap belum selesai.
- Keputusan login terbaru menggantikan jalur utama SIWE extension: Privy dengan Google dan embedded Ethereum wallet. SDK/config FE siap; pengguna akan membuat app dashboard dan memberikan App ID publik kemudian. Tanpa App ID, latihan tetap tersedia dan Google login tidak dipalsukan.
- Server harus memverifikasi token Privy dan menegakkan kepemilikan resource. Update backend merupakan dependensi lintas tim, bukan dianggap selesai karena tombol login sudah ada. Detail `PRIVY_AUTH_HANDOFF.md` menjadi acuan terbaru untuk auth; pembahasan SIWE sebelumnya adalah baseline historis.
- Verifikasi di repo Momonad: typecheck seluruh workspace PASS, 20 unit FE PASS, 3 golden browser PASS, 10 kelompok pemeriksaan browser PASS, tujuh model termuat, console error/warning 0. Root test masih berhenti pada satu guard CRLF sim bawaan T02. Google OAuth, wallet provisioning dan otorisasi server nyata belum diuji.
- Status T03: acceptance lokal dan golden terbukti. Target berikutnya T04 (run/WS, input ordering, watermark, snapshot, ack dan result) bergantung backend serta kontrak auth Privy. Kamera kabin tetap opsional. Estimasi 50 jam tidak berubah; belum ada pencatatan jam aktual atau rebaseline durasi integrasi baru.
- Laporan bukti dan batasan ada di `T03_IMPLEMENTATION.md`. Source ada di Momonad; tidak ada commit/push/deployment atau pesan kepada tim.

## 15. Pembaruan persiapan T04 — 22 Oktober 2026

- Adapter run REST dan PlayClient WS sudah dibuat terhadap protokol bersama: offset jam/startAt, next-tick input, watermark/snapshot, ACK SPEC, buffer berurutan, handshake idempoten saat reconnect, pemisahan hasil lokal/server/chain dan invalidasi sesi.
- `/online` tersedia sebagai gate kesiapan. Tanpa mode live, App ID, URL layanan dan profil game terverifikasi, tidak ada run yang dibuat. `/dev/network` merupakan harness development dengan server simulasi Playwright, bukan multiplayer nyata; tidak masuk bundle produksi.
- Fetch menemukan branch `dharu/server` commit `bbc7e3c`, dengan server dasar dan SIWE/me, tetapi belum route run/play WS atau verifier Privy. Branch dibaca dan tidak digabungkan otomatis. Shared backend/config/sim tidak diubah.
- T04 berstatus FE ADAPTER READY / LIVE INTEGRATION BLOCKED, belum DONE. Menunggu App ID/dashboard Privy dan implementasi backend yang menerima token Privy serta endpoint run/WS. T09 baru memiliki fondasi buffer/reconnect memori; reload/cross-tab/resync nyata belum selesai.
- Pengujian frontend setelah review: 41 unit PASS, termasuk 21 test T04 baru. Review independen menghasilkan empat temuan penting yang diperbaiki dengan regresi RED→GREEN. Bukti akhir browser/build dan daftar gap ada di `T04_IMPLEMENTATION.md`.
- Berikutnya: Dharu mengikuti handoff auth/run; pengguna mengisi App ID publik setelah app dibuat; lalu lakukan parity dan otorisasi lintas akun pada backend nyata. Jika layanan belum siap, T05 HUD/warning/audio lokal dapat dilanjutkan tanpa mengklaim feed on-chain sudah aktif.
- Estimasi 50 jam tetap baseline; tidak diklaim sebagai jam kerja aktual. Tidak ada commit/push/merge/deployment atau transaksi.

## 16. Pembaruan T05 lokal/kontrak — 22 Oktober 2026

- HUD latihan dan online disatukan: target tier sesuai mobil/minCarTier, waktu/kecepatan, mepet/koin lokal, status rem/nitro/melambat, coin pop dari event sim asli.
- Semua warning memakai ikon/nama/lajur/countdown 60 tick; cue lajur berkedip 1 Hz dan menjadi statis pada reduced motion. Audio pendek aktif hanya setelah gesture, dapat dimatikan, dan dibersihkan pada tab tersembunyi/akhir/navigasi. File audio/engine sound tidak ditambahkan.
- Feed adapter verified/recorded tersedia dengan dedup index, blok/latensi/tautan tx. Receipt tidak mengkredit saldo lokal. Ini persiapan FE-5, bukan feed indexer live.
- Verifikasi final langsung di Momonad: 53 unit FE PASS, typecheck/build PASS (1m51s), browser HUD/audio 11 kelompok, jaringan 10 kelompok dan regresi 10 kelompok termasuk golden3 PASS; fixture development tidak masuk bundle produksi. Satu temuan penting review mengenai deadline nada diperbaiki dengan dua regresi RED→GREEN. Sampel rAF46 saat host juga melakukan build bukan acceptance performa laptop demo. Bukti dan gap di `T05_IMPLEMENTATION.md`.
- Status T05: FE-3 lokal dan komponen feed tersedia; acceptance live T04/T05 tetap menunggu App ID serta verifier/run/WS/indexer backend. Audio native headless teruji; pendengaran dan performa perangkat demo masih perlu playtest. Shared config/sim/backend tidak diubah.
- Berikutnya: integrasi layanan nyata bila siap; bila belum, adapter host room dan penonton dapat dikerjakan terhadap protokol, dengan state yang jujur. Estimasi 50 jam tetap baseline, bukan timesheet aktual. Tidak ada commit/push/deployment/transaksi.

## 17. Pembaruan T07/T08 lokal/kontrak — 22 Oktober 2026

- T06 pembelian menunggu voucher/ABI/backend; pekerjaan independen berlanjut ke host room dan penonton publik.
- Adapter POST room ber-token segar, public GET/polling, share code/URL dan roomCode ke POST run tersedia. Host tidak membuka watch socket sehingga tidak menambah jumlah penonton.
- WatchClient publik mengirim tiga gangguan dengan lane/duration config, energi server, satu pending, rejected/unknown/reconnect tanpa replay. Pergantian run mengisolasi event socket lama. Expiry menonaktifkan kiriman tanpa memutus hasil run aktif. Scheduled/receipt/result terpisah dari saldo.
- Source akhir di Momonad: 70 unit FE PASS; satu temuan review expiry diperbaiki dengan dua regresi RED→GREEN. Typecheck/build PASS; browser room12 + regresi10 termasuk golden3 + jaringan10 + HUD11 = 43 kelompok PASS, console bersih. Harness transient HUD distabilkan tanpa perubahan game. Bukti dan batas acceptance di T07_T08_IMPLEMENTATION.md.
- Status T07/T08 FE ADAPTER READY / LIVE INTEGRATION BLOCKED. Backend dharu/server belum memiliki room/run/watch/Privy; App ID dari pengguna masih ditunggu. Unit/dua penonton simulasi tidak membuktikan ownership backend, kapasitas nyata atau chain.
- Estimasi 50 jam tidak berubah menjadi timesheet. Shared sim/config/backend tidak diubah. Tidak ada commit/push/merge/deployment atau transaksi.


## 18. Pembaruan T09 lokal/kontrak — 22 Oktober 2026

- GET run summary publik dan halaman hasil tersedia dengan status lifecycle/gameplay/chain terpisah, receipt/tautan explorer, pagination dan stale/error/invalid-ID. Tidak mengubah saldo atau kelulusan.
- URL online menyimpan ID publik setelah create berhasil; reload/sesi berganti hanya membuka status, tanpa POST/WS resume otomatis atau input/token dalam storage. Missed WS result dapat dibaca melalui REST setelah local end.
- Same-page reconnect FIFO T04 diperkuat: grace30s dicek sebelum/sesudah token serta socket open, dan retry gagal mempertahankan outage awal. Empat regresi terbukti RED→GREEN.
- Status T09 FE STATUS RECOVERY READY / LIVE INTEGRATION BLOCKED. Full reload gameplay, cross-tab, penemuan active run setelah POST ambigu dan recovery server belum selesai; backend endpoint serta App ID Privy masih diperlukan. Verifikasi akhir Momonad: 85 unit FE, 31 kelompok browser (hasil11+jaringan10+regresi10 termasuk golden3), typecheck/build dan eksklusi fixture produksi PASS. Console bersih. Sampel rAF headless30 bukan acceptance perangkat demo; tuning T10 masih perlu. Bukti di T09_IMPLEMENTATION.md.
- T06 pembelian tetap blocked voucher/ABI/backend. Berikutnya T10 tuning/aset lokal; live QA T11 tetap menunggu layanan. Estimasi50jam bukan timesheet. Shared backend/config/sim tidak diubah; tidak ada commit/push/merge/deploy/transaksi.


## 19. Pembaruan T10 lokal/render — 22 Oktober 2026

- PineTree_1/Rock_1 dari Ultimate Nature serta Streetlight_Single dari Modular Streets sudah diimpor dengan dua lisensi CC0 asli, manifest sumber/hash dan converter. Warna/pivot/skala disesuaikan; tujuh Cars GLB lama tetap utuh. Jalan empat lajur/marka/curb/truk/SPIKES procedural; kabin opsional belum dibuat.
- Traffic empat pool instance, scenery tiga pool, marka matriks tetap. Sim/config/hitbox/backend tidak diubah. Fixture DEV 48 kendaraan mengukur renderer tanpa input/network/hasil game; fixture/probe dihapus dari produksi.
- Baseline 8detik vs100detik staging pada Edge headless, GPU aktual Intel Iris Xe/ANGLE D3D11: median draw call610→27 (-95,57%), seluruh48 instance dipertahankan. Staging100detik59,90FPS; DPR2 singkat58,31FPS, viewportHP60,05FPS. Triangle122,6k→185,1k karena scenery; geometri27–30 selama100detik. Spike terburuk171,8ms tetap ada, sehingga tidak mengklaim stutter hilang atau acceptance perangkat demo selesai.
- Verifikasi akhir Momonad:91unitFE, typecheck/build dan31kelompokbrowser (regresi10/golden3+jaringan10+HUD11) PASS. Profil100detik akhir 60,00FPS, median27call, seluruh48instance; framep95 19,50ms dan spike 53,30ms. Console bersih, fixture/probe DEV tidak masuk produksi, hash aset/source sesuai. Satu timeout HUD tidak terulang pada diagnostik/rerun asli; penyebab awal belum terbukti.
- Status T10 LOCAL ASSETS/RENDER READY / PHYSICAL DEMO ACCEPTANCE PENDING. Playtest kontrol/audio terdengar/HUD/performa100detik di perangkat demo masih diperlukan. Bukti dan batasan di T10_IMPLEMENTATION.md. Koreksi istilah GPU T09: sampel lama hanya diketahui Edge headless, bukan SwiftShader.
- Berikutnya T11 QA lintas alur/checklist dan T12 runbook/handoff yang dapat disiapkan lokal. T06/live T04–T09 masih menunggu App ID/dashboard Privy, verifier dan endpoint backend, indexer/ABI/voucher serta acceptance otorisasi lintas akun. Estimasi50jam bukan timesheet; tidak ada commit/push/merge/deploy/transaksi.


## 20. Konfigurasi Privy dan persiapan push — 22 Oktober 2026

- App ID publik sudah diberikan dan dipasang di contoh env serta env lokal yang di-ignore. SDK Privy nyata berhasil membaca konfigurasi app (HTTP 200); tombol Google aktif. App Secret tidak disimpan dalam source/Git dan perlu dirotasi karena sempat dibagikan di chat.
- Unit frontend 91 PASS; typecheck/build PASS; 10 kelompok regresi browser tanpa App ID termasuk golden3 PASS. Verifikasi Google OAuth, embedded wallet untuk akun nyata serta verifier/ownership backend masih diperlukan.
- Pengguna mengizinkan 15 commit dan push ke branch raka/foundation; tidak ada izin merge/deploy/transaksi. Pembagian commit dan bukti pemeriksaan sebelum publikasi ada di PUBLISH_HANDOFF.md. Estimasi 50 jam tetap baseline, bukan timesheet aktual.
