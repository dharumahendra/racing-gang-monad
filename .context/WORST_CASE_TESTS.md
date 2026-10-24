# Uji Skenario Terburuk — Backend

Tujuan: menguji backend terhadap kondisi paling buruk yang masuk akal menurut PRD dan TECH_SPEC, per aspek kualitas software (ketahanan/durabilitas, integritas & keamanan, performa, kebenaran, pemulihan).

Ruang lingkup: hanya requirement yang komponennya sudah ada. Yang bergantung pada komponen yang belum dibuat **dilewati** (lihat bagian terakhir).

Status: **S** = skenario disusun, **L** = lulus, **G** = gagal (lalu diperbaiki atau dicatat).

## A. Ketahanan dan durabilitas

| ID | Skenario terburuk | Yang diharapkan (sumber) | Cara uji |
|---|---|---|---|
| A1 | Proses server dibunuh paksa (kill -9) di tengah banyak run, DB file SQLite | DB tidak korup; saat start ulang semua run terbuka ditutup `PARTIAL` di `verified_tick`, hash akhir dari replay, mepet terverifikasi tidak hilang (TECH_SPEC §5.3) | `scripts/crash-test.ts`: server sebagai proses anak, bot real-time, `kill` di tengah run, start ulang, periksa DB |
| A2 | Server mati setelah run selesai tapi **sebelum** mepet dan `RunEnd` sempat tercatat on-chain (antrean relayer di memori hilang) | Mepet terverifikasi tetap dikirim ulang ke relayer setelah restart; koin dan status lulus tidak hilang (TECH_SPEC §5.3, PRD §8) | Test: run selesai, buat app baru di DB yang sama, cek antrean relayer |
| A3 | Error tak terduga (mis. DB gagal menulis) saat memproses pesan WS | Satu pesan gagal tidak boleh mematikan seluruh server; pemain lain tetap jalan | Test: paksa DB melempar error di tengah pesan, cek server tetap melayani |
| A4 | Error di job berkala (timeout run, energi) atau handler event chain | Server tidak mati | Test: paksa error, cek proses tetap hidup |
| A5 | RPC chain mati saat `POST /runs` dan di tengah run | `POST /runs` → 503 `CHAIN_UNAVAILABLE` tanpa run nyangkut; run yang sedang jalan tetap diverifikasi, catatan menunggu di antrean (TECH_SPEC §4.2, §7.1) | Test |
| A6 | Pemain putus berkali-kali (10× reconnect) dalam satu run, termasuk saat ada gangguan penonton belum di-ack | Run tetap `VERIFIED`; tidak ada mepet ganda; gangguan dikirim ulang (PRD §8) | Test |
| A7 | Pemain buka dua tab | Koneksi lama ditutup, hanya satu yang aktif, run tetap benar | Test |

## B. Integritas dan keamanan (curang)

| ID | Skenario terburuk | Yang diharapkan (sumber) | Cara uji |
|---|---|---|---|
| B1 | Double-click / dua request `POST /runs` bersamaan | Hanya satu run aktif per pemain (TECH_SPEC §5.2) | Test: `Promise.all` |
| B2 | Dua request voucher bersamaan untuk tier yang sama | Koin disisihkan sekali, voucher sama (TECH_SPEC §5.5) | Test |
| B3 | **Slow-motion**: client menjalankan game lebih lambat dari jam (mis. 0,5×) supaya lebih mudah mepet | Ketahuan sebagai kecurangan waktu (PRD §9.3 "deteksi speedhack") | Test: watermark terus tertinggal sambil tetap online |
| B4 | Pemain selalu menjawab gangguan penonton dengan `applied=false` walau masih sempat | Ketahuan (gangguan penonton tidak bisa dihindari sesuka hati) | Test |
| B5 | Pemain tidak pernah mengirim ack gangguan | Verifikasi berhenti di `warnTick`, run berakhir `PARTIAL`; tidak ada mepet setelah itu (TECH_SPEC §5.3) | Test |
| B6 | Banjir pesan (> 120/dtk), pesan > 4 KB, JSON rusak, field aneh (fuzz 2.000 pesan acak) | Ditolak / koneksi ditutup; server tidak crash | Test |
| B7 | `seq` loncat ke angka sangat besar, input duplikat, ratusan input dalam satu tick, input tick > 3000 | Tidak merusak verifikasi; hasil backend tetap = replay log | Test |
| B8 | `run.ready` untuk run milik pemain lain | Ditolak | Test |
| B9 | Token palsu: `alg: none`, HS256 saat SIWE mati, tanda tangan diubah, kedaluwarsa | 401 (TECH_SPEC §5.1) | Test |
| B10 | Injeksi lewat parameter (kode room, runId, nick) | Ditolak validasi / tidak berdampak | Test |
| B11 | Penonton membanjiri gangguan dan membuka koneksi melebihi batas | Energi, rate, dan maks 50 per room ditegakkan (PRD §7) | Sudah ada di `rooms.test.ts`; diulang dengan banjir |

## C. Performa dan skalabilitas

| ID | Skenario terburuk | Yang diharapkan (sumber) | Cara uji |
|---|---|---|---|
| C1 | 30 pemain real-time bersamaan + 1 room dengan 50 penonton yang terus mengganggu | Semua run `VERIFIED`, mepet backend = lokal, event loop tidak macet (lag p99 < 50 ms), latensi verifikasi rendah (PRD §11: ≥ 10 penonton) | `scripts/stress.ts` dengan WebSocket sungguhan |
| C2 | DB besar: 50.000 run, 1 juta entri log, 200.000 baris ledger | `/leaderboard`, `/me`, `/runs/:id`, `/runs/:id/log` tetap cepat (< 50 ms) | `scripts/stress.ts --bigdb` |
| C3 | Log run terbesar yang mungkin (120 pesan/dtk × 100 dtk) | Disimpan, bisa diambil, replay cocok | Test |
| C4 | Ribuan run dan koneksi keluar-masuk | Memori tidak bocor: map sesi, hub, dan room kembali kosong | Test |
| C5 | Venue demo: puluhan pemain keluar lewat satu IP publik (Wi-Fi yang sama) | Tidak ada yang kena 429 karena pemain lain; satu pemain tetap dibatasi | Test |

## D. Kebenaran di batas

| ID | Skenario terburuk | Yang diharapkan (sumber) | Cara uji |
|---|---|---|---|
| D1 | Run berjalan penuh sampai tick 3000 | `TIME_UP`, `endTick = 3000` (TECH_SPEC §2.2) | Test |
| D2 | Watermark melompat langsung ke 3000 dalam satu pesan (setelah offline lama) | Diproses semua, tidak dianggap speedhack bila sesuai jam | Test |

## Dilewati (requirement lain belum ada)

| Requirement | Menunggu |
|---|---|
| Relayer/indexer live: revert, `IndexGap`, nonce macet, reorg, RPC rate limit | Kontrak + relayer Bayu |
| Latensi on-chain nyata ≤ 2 dtk (PRD §11) | Kontrak di testnet |
| Audit terhadap event on-chain | Kontrak |
| Token Privy sungguhan dan kedaluwarsa token di tengah run | Kredensial Privy |
| Jaringan HP (3G, pindah Wi-Fi), browser di-background | Frontend + hosting |
| TLS/WSS, reverse proxy, rate limit per IP di belakang proxy | Hosting |

## Hasil (22 Oktober 2026)

Dijalankan di laptop dev (Windows, Intel Core Ultra 5 125H, Node 24), `CHAIN_MODE=mock`. Server, bot, dan penonton berjalan di mesin yang sama, jadi angka performa adalah batas bawah yang konservatif.

### Ringkasan

| ID | Hasil awal | Setelah perbaikan | Catatan |
|---|---|---|---|
| A1 | — | **L** | 8 run dibunuh paksa: DB `integrity_check` ok, semua run `PARTIAL` di `verified_tick`, 0 mepet hilang, audit cocok, koin = mepet tercatat |
| A2 | **G** | **L** | Bug: run yang sudah selesai tapi belum tercatat on-chain hilang dari antrean setelah restart (koin dan status lulus tidak pernah tercatat) |
| A3 | **G** | **L** | Bug: satu error di handler WS menjadi uncaught exception yang **mematikan seluruh server** |
| A4 | **G** | **L** | Bug: error di job berkala juga mematikan proses |
| A5 | L | L | 503 `CHAIN_UNAVAILABLE` tanpa run nyangkut; RPC mati di tengah run tidak mengganggu verifikasi |
| A6 | G (harness) | L | 10× putus-sambung + gangguan saat offline: tetap `VERIFIED`, tanpa mepet ganda. Ditemukan aturan client: ack ulang harus memakai keputusan yang sama |
| A7 | L | L | |
| B1 | **G** | **L** | Bug: double-click `POST /runs` bisa membuat dua run aktif |
| B2 | L | L | |
| B3 | **G** | **L** | Celah: slow-motion 0,5× tidak terdeteksi. Sekarang flag `SLOW_CLIENT`; putus-sambung biasa tidak kena |
| B4 | **G** | **L** | Celah: gangguan penonton bisa selalu ditolak. Sekarang flag `DISRUPTION_DODGE`; ack yang memang terlambat tidak kena |
| B5 | L | L | Verifikasi berhenti di `warnTick − 1`, run `PARTIAL` |
| B6 | L | L | 2.000 pesan acak, pesan > 4 KB, banjir > 120/dtk (ditutup 4429) |
| B7–B11 | L | L | |
| C1 | **G** | **L** | 25 pemain real-time + 90 penonton (50 di satu room). Lihat angka di bawah |
| C2 | **G** | **L** | `/leaderboard` 152 ms per request di 50.000 run (memblok event loop) → 2 ms |
| C3 | L | L | Log 10.000+ entri: replay cocok |
| C4 | L | L | 100 run + koneksi: map sesi, hub, room kembali 0 |
| C5 | **G** | **L** | Bug: rate limit per IP membuat pemain ke-21 di Wi-Fi yang sama kena 429 |
| D1 | L | L | Terlihat di C1: bot `TIME_UP @3000`, 119 mepet, `VERIFIED` dan cocok |
| D2 | L | L | Watermark 0 → 3000 sekaligus: diproses < 1 dtk, `VERIFIED` |

### Angka performa

| Uji | Sebelum | Sesudah |
|---|---|---|
| C1: bot lulus (`VERIFIED` + mepet cocok) | 20/25 (5 kena 429) | **25/25** |
| C1: jeda event loop p99 selama beban | 77 ms | **45 ms** |
| C1: gangguan penonton diterima di run berjalan | — | 90 (semua run tetap cocok) |
| C1: memori puncak | 257 MB | 181 MB |
| C1: latensi mepet → tercatat (mock) | | median ±200 ms |
| Profil 25 pemain (tanpa login): event loop p50 / p99 | 5,9 / 47 ms | 5,9 / 21 ms |
| C2: `/leaderboard` p50 (50.000 run) | 152 ms | **2,1 ms** |
| C2: `/me`, `/runs/:id`, `/runs/:id/log` (10.000 entri) p50 | | 2,5 / 1,4 / 23 ms |

Lonjakan maksimum (±300 ms) hanya terjadi saat 25 bot login SIWE bersamaan (verifikasi tanda tangan di JS). Jalur ini hanya untuk bot; login Privy memakai verifikasi ES256 native.

### Perbaikan

1. Handler `/ws/play` dan `/ws/watch` menangkap error tak terduga (dicatat ke log, server tetap jalan).
2. Job berkala dipindah ke `src/jobs.ts` dan dibungkus try/catch.
3. Pemulihan saat start mengirim ulang `RunStart`, mepet belum tercatat, dan `RunEnd` untuk semua run `PENDING` ≤ 10 menit, termasuk yang sudah selesai.
4. `POST /runs` dikunci per pemain selama diproses.
5. Flag `SLOW_CLIENT` dan `DISRUPTION_DODGE`.
6. Rate limit dikunci per token login (IP hanya untuk request tanpa login).
7. SQLite `synchronous = NORMAL` (WAL): tidak fsync di setiap commit; aman dari proses mati, DB tidak korup saat listrik padam.
8. Handler event `NearMiss` dalam satu transaksi; bus event chain memberi giliran ke event loop di antara event (batch 60 mepet tidak memblok ±100 ms).
9. Baris room di-cache (dibaca di setiap pesan penonton).
10. Partial index `runs_leaderboard_v2` (migrasi `0004`) dengan urutan yang sama dengan query leaderboard.
11. `/health` menambah `eventLoopLagMs`, `memoryMb`, dan `connections` untuk memantau server saat demo.

### Belum diperbaiki (perlu keputusan / di luar backend)

| Temuan | Rekomendasi |
|---|---|
| `SLOW_CLIENT` dan `DISRUPTION_DODGE` hanya flag; mepet sebelum terdeteksi tetap tercatat on-chain | Putuskan setelah frontend diuji di HP apakah flag ini membatalkan run. Mengubahnya mudah (`finish('INVALID', …)`) |
| Overhead query builder drizzle ±30% CPU server | Prepared statement di `pump()` dan handler event chain kalau target > ±80 pemain bersamaan |
| `trustProxy: true` mempercayai header `X-Forwarded-For` dari siapa pun | Saat deploy: aktifkan hanya kalau server di belakang reverse proxy; kalau langsung terekspos, set `false` supaya rate limit per IP tidak bisa diakali |
| `/runs/:id/log` 23 ms untuk 10.000 entri | Log tidak berubah setelah run selesai; tambahkan `Cache-Control` / cache memori kalau halaman audit ramai |
| Ack gangguan yang hilang menahan verifikasi sampai client tersambung lagi | Sudah sesuai spec; client wajib mengirim ulang ack dengan keputusan yang sama (catatan untuk Raka di BACKEND_PLAN P3) |

### Cara menjalankan ulang

```bash
pnpm --filter @racing-gang/backend test                                        # A2–A7, B1–B11, C3–C5, D2 (test/worst-case.test.ts)
pnpm --filter @racing-gang/backend crash-test -- --players 8 --kill-after 25   # A1
pnpm --filter @racing-gang/backend stress -- --players 25 --spectators 50      # C1 (±2,5 menit)
pnpm --filter @racing-gang/backend bigdb -- --runs 50000                       # C2 (±1 menit)
```
