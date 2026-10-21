# TASKS — MEPET (nama kerja)

**Versi:** Draft 1.0 · 21 Oktober 2026 · pasangan dari `PRD.md` dan `TECH_SPEC.md`

| Orang | Peran | Memegang |
|---|---|---|
| **Bayu** | Smart contract | `/contracts`, `apps/server/src/chain` (relayer, indexer, voucher signer), halaman audit |
| **Dharu** | Backend | `packages/config`, `packages/sim`, `apps/server` (auth, runs, verifikasi, rooms, ledger, WS) |
| **Raka** | Frontend | `apps/web` (game, HUD, garasi, room, penonton), aset visual |

Prioritas: **P0** wajib ada untuk demo · **P1** sangat membantu pitch · **P2** setelah lomba.

---

## 0. Aturan kerja

1. **Kode baru dimulai saat hacking dibuka di hari H.** Sebelum itu, hanya baca dokumen, siapkan akun, wallet, dan bukti lisensi aset. Konfirmasi ke panitia soal menyiapkan aset sebelum hari H.
2. Repo **publik** sejak commit pertama.
3. `packages/config` dan `packages/sim` adalah sumber kebenaran. Perubahan angka atau logika harus lewat PR kecil dan diumumkan ke tim.
4. **Interface dibekukan di M0**: tipe pesan WS (TECH_SPEC §4), REST (§5.1), ABI (§6). Perubahan setelah M0 harus disepakati bertiga.
5. Branch per orang (`bayu/*`, `dharu/*`, `raka/*`), merge ke `main` sesering mungkin. `main` harus selalu bisa jalan.
6. Di kode, gangguan "rantai" dinamai `SPIKES` supaya tidak tertukar dengan blockchain.

## 1. Persiapan sebelum hari H (tanpa coding)

- [ ] Semua: baca `PRD.md` dan `TECH_SPEC.md`, catat pertanyaan, dan sepakati asumsi di PRD §12.
- [ ] Dharu: konfirmasi tertulis ke panitia soal aturan aset dan kode sebelum acara; simpan screenshot-nya.
- [ ] Bayu: siapkan 5 wallet testnet (deployer, attester, voucher signer, treasury, presenter) dan isi MON dari faucet; simpan kunci di password manager, bukan di repo.
- [ ] Bayu: daftar RPC khusus Monad testnet (cadangan RPC publik) dan catat `CHAIN_ID` serta URL explorer dari dokumentasi resmi.
- [ ] Dharu: siapkan akun hosting server yang mendukung WSS (misalnya Railway/Fly/VPS) dan domain HTTPS.
- [ ] Raka: kurasi aset mobil (5 mobil pemain, mobil lalu lintas, truk, rantai, jalan). Utamakan CC0, catat sumber dan lisensinya untuk `LICENSES.md`. Siapkan akun hosting web (misalnya Vercel).
- [ ] Semua: siapkan hotspot cadangan untuk hari H.

## 2. Urutan integrasi di hari H (saran waktu)

| Milestone | Waktu | Target | Siapa |
|---|---|---|---|
| **M0** | 12.00–12.30 | Monorepo, `packages/config`, stub `packages/sim` (tipe dan API), stub ABI, interface dibekukan | Semua |
| **M1** | 12.30–14.30 | Kontrak lulus test dan ter-deploy · sim inti (lalu lintas, tabrakan, mepet) + login + `POST /runs` + WS input + verifikasi · scene game jalan dengan sim lokal | Masing-masing |
| **M2** | 14.30–15.30 | Relayer mengirim `NearMiss` on-chain · indexer mengkredit koin · HUD menampilkan feed on-chain | Bayu + Dharu + Raka |
| **M3** | 15.30–16.30 | Gangguan (NPC + penonton), room, halaman penonton · alur voucher + `buy()` | Semua |
| **M4** | 16.30–17.15 | Uji end-to-end di testnet dengan 3+ HP · halaman audit (P1) · perbaikan bug | Semua |
| **M5** | 17.15–18.00 | Gladi demo, rekam video cadangan, README, freeze sebelum 18.00 | Semua |

Makan siang bergantian supaya pekerjaan di jalur kritis tidak berhenti.

**Urutan pemotongan jika tertinggal** (dipotong dari atas): leaderboard → QR room → tampilan live 2D penonton → halaman audit → reconnect dan buffer offline → gangguan NPC dua lajur. Jangan memotong: mepet on-chain, beli mobil soulbound, dan penonton dengan minimal 3 tombol gangguan.

---

## 3. Bayu — Smart Contract dan integrasi chain

| ID | P | Tugas | Bergantung | Selesai jika |
|---|---|---|---|---|
| SC-1 | P0 | Proyek Foundry + OZ v5; script yang membaca `CARS` dari JSON `packages/config` | M0 | `forge build` lulus; angka kontrak berasal dari config |
| SC-2 | P0 | `RunRegistry.sol` sesuai TECH_SPEC §6.1 | SC-1 | Semua aturan dan event sesuai spec |
| SC-3 | P0 | `CarNFT.sol` (ERC-721 + ERC-5192, voucher EIP-712) sesuai §6.2–6.3 | SC-1 | Transfer dan approve revert; `buy` sesuai aturan |
| SC-4 | P0 | Test Foundry (daftar di bawah) | SC-2, SC-3 | `forge test` hijau |
| SC-5 | P0 | Script deploy Monad testnet + verifikasi explorer + tulis `deployments/monad-testnet.json` | SC-4 | Alamat dan ABI terbaca oleh server dan web |
| CH-1 | P0 | Relayer (`chain/relayer.ts`) sesuai §7.1 | SC-5, DH-5 | Mepet tercatat on-chain dengan median ≤ 2 dtk dari verifikasi |
| CH-2 | P0 | Indexer (`chain/indexer.ts`) sesuai §7.2 + backfill dari `chain_cursor` | SC-5 | Koin terkredit dari event; `nearMiss.recorded` terkirim |
| CH-3 | P0 | `signVoucher()` EIP-712 (§7.3) | SC-5 | Voucher dari server diterima `buy()` di testnet |
| SC-6 | P1 | Ukur gas `submitBatch` untuk 1, 20, dan 60 record; sesuaikan `maxBatchNearMiss` | SC-5 | Angka gas dicatat di README |
| AU-1 | P1 | Halaman audit `/run/:id` (TECH_SPEC §8.5) | DH-2, CH-2 | Run asli menghasilkan ✓ semua; log yang diubah sedikit menghasilkan ✗ |
| SC-7 | P2 | Script rekonstruksi saldo koin dari event (`NearMiss` − `Purchased`) | CH-2 | Hasilnya sama dengan DB |

**Test wajib (SC-4):**
- `submitBatch` hanya bisa dipanggil attester.
- Seed dihitung dari `blockhash(seedBlock)`; `seedBlock` terlalu lama atau di masa depan → revert.
- `carTier > 0` tanpa NFT → `CarNotOwned`.
- `index` duplikat dilewati tanpa revert; `index` loncat → `IndexGap`; `tick > 3000` → revert.
- `Qualified` muncul tepat pada mepet ke-40/75/110/150, dan hanya jika `carTier ≥ minCarTier`.
- Starter yang mencapai 150 mepet hanya lulus Tier 1.
- `EndRec` dengan jumlah yang tidak cocok → `CountMismatch`; record setelah run selesai → revert.
- `buy`: tidak lulus, harga salah, suplai habis, sudah punya, voucher kedaluwarsa, nonce dipakai ulang, tanda tangan salah, pembeli bukan `v.buyer` → semuanya revert dengan error yang tepat.
- `transferFrom`, `safeTransferFrom`, `approve` → revert `Soulbound`; `locked()` mengembalikan true; `supportsInterface(IERC5192)` mengembalikan true.
- Tidak ada fungsi yang bisa mint tanpa `buy`.

## 4. Dharu — Backend dan simulasi

| ID | P | Tugas | Bergantung | Selesai jika |
|---|---|---|---|---|
| DH-1 | P0 | Monorepo pnpm + `packages/config` (TECH_SPEC §2.2) + ekspor JSON untuk kontrak | — | Tiga app bisa meng-import config |
| DH-2 | P0 | `packages/sim`: PRNG, generator lalu lintas, langkah tick, tabrakan, mepet, hash chain (§3.1–3.6, §3.8). **Kirim stub API ke Raka dalam 30 menit pertama** | DH-1 | Golden test lulus di Node dan browser |
| DH-3 | P0 | Gangguan di sim: NPC, `trySchedule`, batas, nitro, rantai, red zone (§3.7) | DH-2 | Test: tidak ada lebih dari 2 lajur merah; aba-aba selalu 60 tick |
| DH-4 | P0 | Server Fastify + WS + SQLite/Drizzle + SIWE + `/me` + `/config` | DH-1 | Login dari web berhasil |
| DH-5 | P0 | `POST /runs`, protokol `/ws/play`, sinkronisasi jam, watermark, loop verifikasi, `run.result` (§4.1, §5.2–5.3) | DH-2, DH-4 | Run lokal dan backend menghasilkan mepet yang sama |
| DH-6 | P0 | Rooms + `/ws/watch` + energi + penjadwalan gangguan + broadcast (§4.2, §5.4) | DH-3, DH-5 | 3 HP bisa mengganggu satu run dengan aba-aba 2 dtk |
| DH-7 | P0 | Ledger koin + reservasi + `POST /vouchers` (§5.5) | DH-4, CH-3 | Beli berhasil; koin terpotong tepat sekali |
| DH-8 | P0 | Deploy server dengan HTTPS/WSS dan CORS | DH-5 | Bisa diakses dari HP lewat internet |
| DH-9 | P1 | Reconnect dan buffer offline di server, serta timeout `PARTIAL` (§5.3) | DH-5 | Putus 5 dtk lalu tersambung → run tetap terverifikasi |
| DH-10 | P1 | Anti-cheat MVP: 1 run aktif, batas run per jam, speedhack, flag klaim tidak cocok (§5.7) | DH-5 | Watermark palsu menghasilkan `INVALID` |
| DH-11 | P1 | `GET /runs/:id`, `GET /runs/:id/log`, `GET /leaderboard` | DH-5 | Halaman audit bisa replay |

**Golden test sim (DH-2/DH-3):**
- Seed dan log yang sama → daftar event identik, termasuk `inputHash`, di Node dan browser (jalankan juga lewat Vitest dengan environment jsdom).
- 1.000 seed acak: tidak ada dua baris berturutan yang menutup semua lajur.
- Kasus mepet: menyalip dari lajur sebelah → terhitung; dua lajur jauhnya → tidak; menyalip di bawah 100 km/j → tidak; tabrakan → tidak ada mepet di tick itu.
- Nitro mengabaikan rem; rantai memotong kecepatan dan menahan akselerasi 45 tick; red zone menggagalkan run hanya saat aktif.

## 5. Raka — Frontend

| ID | P | Tugas | Bergantung | Selesai jika |
|---|---|---|---|---|
| FE-1 | P0 | Vite + React + TS, routing, wagmi (Monad testnet), connect wallet + SIWE | DH-4 | Login berhasil, chain salah ditangani |
| FE-2 | P0 | Scene game (R3F): jalan 4 lajur, mobil, lalu lintas, rantai, red zone; langkah tetap 30 Hz dengan interpolasi; kamera chase; kontrol `←/A`, `→/D`, `↓/S`. **Mulai dengan kotak placeholder sambil menunggu aset** | stub DH-2 | Stabil 60 fps di laptop demo |
| FE-3 | P0 | HUD: waktu, kecepatan, mepet dan target, koin run, efek "+100/+200", aba-aba 2 dtk (kedip lajur, ikon, hitung mundur, suara), layar hasil | FE-2 | Semua gangguan terbaca jelas 2 dtk sebelum aktif |
| FE-4 | P0 | Netcode client: WS, sinkronisasi jam, `input`, `watermark`, `disruption.ack`, `snapshot` (§4.1, §8.3) | DH-5 | Mepet lokal sama dengan `nearMiss.verified` |
| FE-5 | P0 | Panel feed on-chain dari `nearMiss.recorded` (index, blok, latensi, tautan tx) | CH-2 | Terlihat jelas dari kursi penonton |
| FE-6 | P0 | Garasi: daftar 5 mobil, statistik, syarat, status lulus, dimiliki, sisa suplai, koin; alur beli (§8.4) | FE-1, DH-7 | Beli Tier 1 di testnet berhasil |
| FE-7 | P0 | Room host: buat room, kode besar, jumlah penonton, mulai run | DH-6 | Penonton bisa masuk dari kode di layar |
| FE-8 | P0 | Halaman penonton mobile-first: masuk dengan kode + nick, energi, tombol Nitro, Rantai, Red zone 3/5/7, pemilih lajur 1–4, status run, feed gangguan | DH-6 | Bisa dipakai satu tangan di HP |
| FE-9 | P0 | Integrasi aset final + `LICENSES.md` | FE-2 | Semua aset punya sumber dan lisensi tercatat |
| FE-10 | P1 | QR code room, tampilan live 2D penonton (`trafficRows` + `run.snapshot`), tombol "Coba transfer" untuk demo soulbound | FE-7, FE-8 | — |
| FE-11 | P1 | Leaderboard, suara mesin dan mepet | DH-11 | — |
| FE-12 | P1 | Buffer input saat offline dan kirim ulang setelah tersambung | FE-4, DH-9 | Game jalan terus saat Wi-Fi dimatikan 5 dtk |

## 6. Uji end-to-end (M4)

- [ ] **E2E-1:** login → run solo → mepet muncul di HUD → muncul di panel feed dengan nomor blok.
- [ ] **E2E-2:** capai 40 mepet → event `Qualified` → garasi menampilkan Tier 1 bisa dibeli.
- [ ] **E2E-3:** beli Tier 1 dengan MON → NFT ada di wallet → coba transfer → gagal.
- [ ] **E2E-4:** room dengan 3+ HP → nitro, rantai, dan red zone tiba dengan aba-aba 2 dtk → diam di lajur merah menggagalkan run.
- [ ] **E2E-5:** matikan Wi-Fi laptop 5 detik saat run → game jalan terus → tersambung → run tetap terverifikasi.
- [ ] **E2E-6:** halaman audit run dari E2E-2 → semua ✓.
- [ ] **E2E-7:** saldo koin di garasi = mepet on-chain × nilainya − biaya pembelian.

## 7. Checklist demo

- [ ] Wallet attester dan voucher signer terisi MON testnet; saldo dicek pukul 17.00.
- [ ] Akun presenter sudah lulus Tier 1 lebih awal di hari H (cadangan jika run live gagal).
- [ ] Video demo cadangan direkam di M5.
- [ ] Laptop demo: browser bersih, wallet presenter terhubung ke Monad testnet, zoom layar pas untuk proyektor.
- [ ] Kode room dan QR terbaca dari belakang ruangan.
- [ ] Hotspot cadangan dan RPC cadangan siap.
- [ ] Naskah pitch mengikuti PRD §10, dan "batas kepercayaan" di PRD §9.3 disampaikan apa adanya.
- [ ] Repo publik, README berisi cara menjalankan, alamat kontrak, dan tautan explorer.

## 8. Definition of Done (P0)

Satu run penuh di Monad testnet: login → main dengan gangguan penonton → setiap mepet tercatat on-chain dan tampil di feed → lulus Tier 1 → beli Tier 1 dengan MON dan koin → NFT soulbound di wallet dan tidak bisa ditransfer. Semua berjalan dari URL publik, bukan localhost.
