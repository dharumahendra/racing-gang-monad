# Implementasi sistem — handoff Kiro, 22 Oktober 2026

Branch `codex/garage-showcase`. Tidak ada push, deployment, transaksi, atau penulisan kontrak (kontrak tidak diizinkan pengguna).

## Kondisi Git sebelum Kiro mulai

- HEAD `550a310`. Perubahan Garage belum di-commit (milik pekerjaan sebelumnya, tidak disentuh): `frontend/package.json`, `scripts/design-check.mjs`, `CarPreview.tsx`, `VehicleModel.tsx`, `main.tsx`, `Garage.tsx`, `styles.css`, file baru `garage.css`, `showroom-camera*.ts`, `garage-dev.tsx`, `garage-check.mjs`, `practice-check.mjs`, `.context/GARAGE_REDESIGN_*.md`, `handoff.md`. Selama sesi muncul pula perubahan yang bukan dari Kiro (kemungkinan dari editor atau agent lain yang berjalan bersamaan): `frontend/index.html`, `App.tsx`, `Theme.tsx`, `Wallet.tsx`, `privy-provider.tsx` (2 baris), `public/fonts/manifest.json`, `public/Logo.svg`, `public/fonts/Akira.otf`, dan penghapusan `favicon.svg`. Typecheck dan 114 tes unit FE tetap lulus pada tree terbaru.
- Remote memiliki `origin/main` `a0f0f44` dan `origin/dharu/worst-case` `6196807` yang belum ada di branch.

## Ringkasan perubahan

1. **Merge** `origin/dharu/worst-case` (termasuk `origin/main`) → commit `3ac7f2f` (izin pengguna). Konflik README diselesaikan; `WORST_CASE_TESTS.md` dipindah ke `.context/` sesuai konvensi dokumen.
2. **Konfigurasi lokal (tidak di-commit, gitignored):** `backend/.env` berisi App ID, App Secret, verification key (dibaca dari API Privy dengan secret tersebut), `JWT_SECRET` acak, DB uji `data/racing-gang.privy-test.db`, `PUBLIC_ORIGIN=http://127.0.0.1:5173`, `CORS_ORIGIN=http://localhost:5173`, `CHAIN_MODE=mock`. `frontend/.env.local` → `live`, API/WS `127.0.0.1:8080`. Bundle produksi diperiksa: tidak mengandung secret/PEM.
3. **Recovery (pekerjaan 5), protokol baru di shared config:**
   - `GET /runs/active` (`ActiveRunResponse`): run aktif milik token, `controlled`, dan `creating` saat POST masih diproses. Identitas hanya dari token.
   - Satu pengendali per run: `/ws/play?client=<kunci acak per halaman>`; kunci diikat pada `run.ready` pertama. Socket lain (kunci beda/tanpa kunci) mendapat `error NOT_CONTROLLER` lalu close `4409` tanpa menerima state run dan tanpa menutup pengendali. Reconnect dari halaman yang sama tetap menggantikan socket lama (4000) tanpa reset `startAt`/seed. Klaim `run.end` dari non-pengendali diabaikan.
   - FE: `PlayClient.clientKey` (memori, tidak disimpan), pesan `NOT_CONTROLLER` terminal; `createRunApi().active()` memvalidasi respons; `Online.tsx` menambah tombol **Periksa run aktif** setelah `UNKNOWN_OUTCOME`/`INVALID_RESPONSE`/`ACTIVE_RUN_EXISTS`. Run `CREATED` tanpa pengendali diadopsi; selain itu ditampilkan tautan status, tanpa POST ulang.
   - Keputusan: **tidak ada full resume setelah reload**. Input/sim state browser tidak disimpan (handoff melarang menyimpan raw input/token di localStorage), dan PRD baseline tidak mensyaratkannya. Reload saat RUNNING → halaman baru ditolak, run berakhir `PARTIAL` jujur setelah `RUN_TIMEOUT_MS`, lalu run baru diizinkan. Bila tim ingin resume penuh, butuh replay otoritatif dari server (log + seq terakhir) — belum disepakati.
4. **Dokumen:** `.context/RUNBOOK.md` (baru), komentar origin di `backend/.env.example`, catatan mode di `frontend/.env.example`, README (endpoint baru, tautan runbook).
5. **Verifikasi JWKS Privy:** `PRIVY_JWKS_URL` opsional (`backend/src/auth/privy.ts`, `env.ts`, `app.ts`). JWKS app saat ini berisi dua kunci (`6UuJ…` = verification key yang terpasang, `j23q…` kunci kedua, kemungkinan rotasi); PEM statis hanya menerima kunci pertama. Dengan JWKS: cache, `kid` asing memicu ambil ulang maks. sekali per 30 dtk, JWKS tidak terjangkau → 503 tanpa lookup user. Issuer/audience/ES256/expiry tetap diperiksa. Tes `privy.test.ts` +5 (rotasi, kunci asing, banjir kid, outage, env). Bukti layanan nyata: backend lokal dengan JWKS asli menolak token berkunci asing ber-`kid` Privy dengan 401 (bukan 503) — JWKS terambil; ini bukan bukti login Google.

File kode yang diubah Kiro: `packages/config/src/protocol.ts`, `backend/src/routes/runs.ts`, `backend/src/services/runs.ts`, `backend/src/services/runSession.ts`, `backend/src/ws/play.ts`, `backend/test/recovery.test.ts` (baru), `backend/test/frontend.integration.test.mjs`, `frontend/src/lib/run-api.ts`, `run-api.test.ts`, `play-client.ts`, `play-client.test.ts`, `frontend/src/pages/Online.tsx`.

## Status enam pekerjaan

| # | Pekerjaan | Status | Terbukti | Belum terbukti |
|---|---|---|---|---|
| 1 | Login Google nyata | **BLOCKED** (eksternal) | Secret valid (API Privy 200); verification key resmi terpasang; backend start dengan Privy; `/me` anonim & token palsu → 401; CORS 127.0.0.1:5173 OK; SDK Privy memuat di `127.0.0.1` dan `localhost` tanpa page error dan modal menampilkan Google (headless, tanpa login). Fixture JWT: token audience salah ditolak sebelum lookup, A/B terisolasi (integrasi). | Dashboard: `google_oauth=false`, embedded `create_on_login=off`, `allowed_domains` kosong. OAuth Google nyata, dua akun A/B, logout/switch nyata — butuh pemilik akun. Pengguna memutuskan tidak merotasi secret (risiko: secret pernah ditulis di chat). |
| 2 | Alur FE + backend + identitas nyata | **PARTIAL** | Backend asli + FE live jalan lokal; integrasi FE client asli ↔ Fastify HTTP/WS ↔ SQLite: room, run, penonton, NITRO, outage, hasil terlewat, finalHash (fixture Privy, MockChain). | Dengan akun Google nyata; SPIKES/RED dari browser penonton; lintas perangkat. |
| 3 | Monad testnet | **BLOCKED** | `live.ts` tetap menolak start (tidak ada fallback mock). | Source kontrak/ABI/alamat/deploy block dari Bayu; manifest masih null; Kiro tidak diizinkan menulis kontrak. Relayer/indexer/signer live menunggu ABI final. |
| 4 | Pembelian mobil | **FE DONE · acceptance BLOCKED** | Flow voucher → wallet Privy → buy() → receipt → /me, stok/sold out, recovery & ambigu (lihat "Pembaruan 23 Oktober"). | Kontrak/ABI/alamat belum di-deploy; backend live + signer + indexer Purchased; tx testnet nyata. |
| 5 | Recovery | **DONE (lokal)** | Lihat tabel bukti. CREATED/countdown/RUNNING/terminal: hasil eksplisit; tanpa run/seed/seq ganda; tab lain tidak bisa takeover. | Uji di browser nyata dua tab dengan Google; resume penuh sengaja tidak dibuat. |
| 6 | Perangkat & operasional | **PARTIAL** | Runbook, env example, typecheck/test/build, crash-test. | Docker (daemon tidak berjalan), CI remote (belum push), 3 HP fisik, hosting HTTPS/WSS, akun presenter. |

## Bukti verifikasi (dijalankan sesi ini)

| Lapisan | Perintah | Hasil |
|---|---|---|
| Unit/integrasi | `pnpm typecheck` | PASS seluruh workspace |
| Unit | config / sim | 9 / 43 PASS |
| Backend (unit + integrasi Fastify/SQLite, fixture Privy, MockChain) | `pnpm --filter @racing-gang/backend exec vitest run --no-file-parallelism` | 13 file, **109 PASS** (termasuk `recovery.test.ts` 8 dan integrasi FE 5) |
| FE unit | `pnpm --filter @racing-gang/frontend test` | 17 file, **114 PASS** |
| RED→GREEN | aturan pengendali dimatikan sementara | 3 tes dua-tab gagal, lalu lulus setelah dikembalikan |
| Build | `pnpm --filter @racing-gang/frontend build` | PASS (2m39s; warning chunk besar tetap) |
| Bundle | cari `privy_app_secret`/PEM di `frontend/dist` | tidak ditemukan |
| Proses nyata | `crash-test --players 3 --kill-after 10` | LULUS: 3 run PARTIAL+SERVER_RESTART, mepet & audit cocok, ledger 1300=1300, antrean relayer dibangun ulang. Percobaan pertama gagal karena timeout start 30 dtk (start dingin tsx). |
| Layanan Privy nyata | `GET api.privy.io/v1/apps/<id>` + probe browser headless | Secret valid; konfigurasi dashboard seperti di atas; SDK & modal Google tampil, tanpa login |
| Suite paralel default | `pnpm --filter @racing-gang/backend test` | 1 timeout acak 5 dtk (file berbeda tiap run) karena beban paralel; lulus dengan `--no-file-parallelism` |
| Tidak dijalankan | Docker build, CI remote, browser scripts (`test:network` dst.), stress 25/50, perangkat fisik, testnet | Docker daemon mati; sisanya butuh perangkat/akses atau tidak terdampak perubahan |

## Aturan akses yang ditegakkan (baru)

| Aktor | Aksi | Kondisi |
|---|---|---|
| Anonim / token invalid | `GET /runs/active`, `/ws/play` | 401 / close 4401 |
| Pemain B | Melihat run aktif A (termasuk `?address=` palsu) | Hanya run milik token B (`null`) |
| Halaman lain milik pemain yang sama | Kendalikan run yang sudah `run.ready` | `NOT_CONTROLLER`, 4409, tanpa state run |
| Halaman pengendali | Reconnect | Diterima, `run.go` sama |

## Dependensi yang masih dibutuhkan

- **Pengguna:** aktifkan Google + embedded wallet + allowed origins di dashboard Privy; login dua akun Google untuk uji A/B; jalankan Docker Desktop bila ingin uji image; izin push bila ingin CI remote.
- **Bayu:** source kontrak `RunRegistry`/`CarNFT`, ABI final, alamat, deploy block, RPC; implementasi relayer/indexer/signer (`TASKS` CH-1..3).
- **Dharu:** review perubahan protokol (`GET /runs/active`, `client`, `NOT_CONTROLLER`); bot `scripts/lib/playerClient` tidak mengirim `client` dan tetap berfungsi (pengendali `null` sampai `run.ready`).

## Risiko operasional

- Suite backend paralel kadang timeout 5 dtk di laptop ini; CI perlu dipantau atau `testTimeout` dinaikkan.
- `scripts/lib/server.ts` menunggu start maks 30 dtk; start dingin bisa mendekati batas itu.
- Bot/client lama tanpa `client` dapat menjadi pengendali "tanpa kunci"; setelah itu halaman FE berkunci ditolak sampai run selesai (aman, tidak ada takeover).

## Langkah lanjut terkecil

1. Ubah dashboard Privy (bagian 4 RUNBOOK).
2. Login akun A di `http://127.0.0.1:5173`, cek `/me` di Garage, buat room/run, buka `/watch` dari HP.
3. Setelah Bayu menyerahkan ABI/alamat: isi manifest, implementasi `live.ts`, uji di anvil sebelum meminta izin transaksi testnet.

## Pembaruan 23 Oktober 2026 — pembelian FE, suplai, wiring

Status pekerjaan 4 (pembelian): **FE DONE, acceptance BLOCKED** pada kontrak. Pekerjaan 1–3 dan 6 tidak berubah statusnya.

Perubahan (frontend; tidak ada kontrak/ABI yang ditulis, tidak ada transaksi dikirim):
- `frontend/src/lib/purchase.ts` + `purchase.test.ts` (18 tes): state machine `PurchaseFlow` reservasi `POST /vouchers` → switch chain → dry run `eth_call` + cek saldo MON → wallet → receipt → polling `/me` sampai `ownedTiers` memuat tier. Kepemilikan di UI hanya dari `/me`, tidak optimistis. Menangani: double click (satu tx), reject (4001), declined network switch, MON kurang, voucher kedaluwarsa/hampir (margin 45 dtk), revert saat dry run (nama error didekode dengan ABI deploy: SoldOut, VoucherUsed, dst.) dan setelah broadcast, POST/broadcast ambigu → `unknown` tanpa retry otomatis, `check()` merekonsiliasi lewat hash tersimpan atau `ownsTier` on-chain, timeout receipt → hash disimpan (`localStorage racing-gang:purchase:<addr>:<tier>`, tanpa token) dan di-resume setelah reload tanpa kirim ulang, indexer lambat → `synced_late`, ganti akun → flow lama di-dispose dan hasil terlambat diabaikan, wallet ≠ akun game → diblok.
- ABI tidak dikarang: `carNftAbiProblems()` memvalidasi ABI dari `packages/config/deployments/monad-testnet.json` terhadap TECH_SPEC §6.2 (`buy(tuple,bytes) payable`, `minted(uint8)`, `ownsTier(address,uint8)`). ABI uji hanya ada di file tes.
- `purchase-runtime.ts`: viem public client (RPC `VITE_RPC_URL`/default), wallet client dari Privy embedded wallet (`getEthereumProvider`, `switchChain`), `purchaseBlockers()` (backend live, manifest ada, ABI cocok, chainId cocok, backend `/health` `chainMode=live`, `/config` CarNFT = manifest, login + wallet), `useSupply()` membaca `minted(tier)` → sisa stok/"Sold out" dengan suplai dari shared config.
- Auth runtime mengekspos `wallet` (embedded wallet) dari `privy-provider.tsx`.
- Garage modal Specs: tombol disabled diganti `PurchasePanel` (stok, alasan blokir, status langkah, tautan explorer, "Check status").
- Online: `PlayClient.qualified` menyimpan `run.qualified`; setelah hasil resmi/Qualified, `/me` di-refresh dan muncul petunjuk "Buy it in the Garage". Explorer memakai `explorerUrl` manifest bila ada (feed, penonton, hasil). Mode Latihan menampilkan tautan ke run online saat mode live.

Bukti dijalankan: FE typecheck PASS; FE unit 18 file / **136 PASS**; FE build PASS; integrasi backend↔FE `frontend.integration.test.mjs` 5 PASS. Tidak dijalankan: browser/visual, OAuth Google nyata, transaksi testnet.

Blocker pembelian (spesifik):
1. Bayu: deploy `CarNFT`/`RunRegistry`, isi `chainId`, `deployBlock`, alamat, `explorerUrl`, dan ABI final di `packages/config/deployments/monad-testnet.json` (saat ini null/kosong → UI menampilkan "car contract isn't deployed yet").
2. Backend `CHAIN_MODE=live` dengan `VOUCHER_SIGNER_PRIVATE_KEY` yang sama dengan `voucherSigner` kontrak, serta indexer `Purchased` (TASKS CH-2/CH-3). Dalam mode mock UI sengaja memblokir, karena voucher mock tidak bisa ditebus on-chain.
3. Akun uji lulus syarat on-chain (`Qualified`) dan saldo MON testnet untuk harga + gas.

Checklist manual pengguna (FE/demo):
- [ ] Garage → tier terkunci → Specs: muncul alasan blokir yang benar (mock: "simulated chain mode"/"contract isn't deployed").
- [ ] Setelah deploy: stok "N of M left" tampil; "Sold out" bila habis.
- [ ] Beli Tier 1: konfirmasi Privy muncul, tolak → "You declined…", setujui → "Waiting for confirmation…" → "Purchase complete", saldo koin turun sekali, Tier 1 Owned setelah reload.
- [ ] Reload saat menunggu konfirmasi → status berlanjut tanpa prompt wallet kedua.
- [ ] Logout/ganti akun saat proses → akun B tidak melihat status/tx akun A.
- [ ] Run online 40 mepet → "Qualified on-chain: Tier 1" dan Garage "Requirements met" tanpa reload manual.
- [ ] Coba transfer NFT di explorer/wallet → revert (soulbound, ditegakkan kontrak).
