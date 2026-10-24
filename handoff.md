# Handoff untuk Kiro — Sisa Sistem Racing Gang

## Konteks

Kamu adalah agent Kiro yang melanjutkan implementasi sistem **Racing Gang**, game balap web dengan mepet (near-miss), penonton yang memberi gangguan, dan progres kendaraan berbasis Monad testnet. Pengguna bertanggung jawab sebagai FE developer. Fokus pekerjaan ini adalah menyelesaikan enam gap sistem di bawah, bukan mendesain ulang UI.

**Kamu bekerja di folder lokal yang sama dengan Codex: `C:\Belajar\Sem5\Momonad`. Ini checkout yang sama, bukan clone baru atau worktree terpisah.** Jalankan perintah proyek dari folder tersebut. Jangan menganggap folder percakapan Codex di Documents sebagai root aplikasi.

Snapshot handoff: **22 Oktober 2026**. Branch terakhir yang teridentifikasi adalah `codex/garage-showcase`, dengan base redesign `550a310`. Ada perubahan Garage yang belum di-commit/push menurut handoff terakhir. Periksa ulang branch, status, dan diff saat mulai; snapshot ini bukan jaminan kondisi Git tidak berubah. Jangan reset, clean, stash, checkout branch lain, atau menimpa perubahan tersebut tanpa koordinasi.

Produk: pemain berlomba di empat lajur, backend memverifikasi simulasi deterministik, mepet dicatat ke chain, dan kendaraan tingkat berikutnya membutuhkan kelulusan serta pembayaran. Kendaraan berbayar bersifat soulbound. Penonton masuk melalui kode room dan mengirim NITRO, SPIKES, atau RED. Kamera belakang wajib; kamera kabin opsional.

Stack yang sudah dipakai: pnpm workspace, React 19 + Vite 7, React Three Fiber/Three.js, Privy Google + embedded Ethereum wallet, Fastify, SQLite/Drizzle, shared config/sim, dan viem. Gunakan Node **22.12+** dan pnpm **9.15.4** sesuai proyek. Pertahankan angka game dan protokol dari shared packages.

## Cara mulai dan sumber kebenaran

1. Baca instruksi `AGENTS.md` yang berlaku dan skill pengguna `C:/Users/hp5cd/.agents/skills/github-test-authorization/SKILL.md` jika tersedia. Terapkan authorization di server/kontrak dan pengujian proporsional.
2. Catat `git status --short`, branch, dan diff awal. Jangan mengubah konfigurasi Git untuk menyembunyikan error akses atau status repository; laporkan jika lingkungan menghalangi inspeksi.
3. Baca `.context/PRD.md`, `.context/TECH_SPEC.md`, `.context/TASKS.md`, `.context/BACKEND_PLAN.md`, dan README terkait.
4. Gunakan `.context/SYNC_IMPLEMENTATION.md` sebagai status integrasi terbaru; `.context/FRONTEND_PLAN.md` bagian 21–22 dan `.context/GARAGE_REDESIGN_IMPLEMENTATION.md` melengkapi status FE. Bagian awal plan adalah sejarah: klaim lama bahwa verifier Privy atau endpoint room/run belum ada sudah tidak berlaku.
5. Cocokkan dokumen dengan source dan tes saat ini. Sebelum implementasi lintas tim, periksa perubahan remote bila akses tersedia; jangan pull/merge otomatis ke checkout yang berisi pekerjaan lokal.

Lokasi penting:

| Area | Lokasi relatif terhadap root repo |
| --- | --- |
| Auth FE | `frontend/src/lib/privy-provider.tsx`, `auth-runtime.tsx`, `privy-session.ts`, `session.ts`, `frontend/src/components/Wallet.tsx` |
| Auth server | `backend/src/auth/privy.ts`, `guard.ts`, `backend/src/routes/me.ts`, `backend/src/env.ts` |
| Online/room/watch | `frontend/src/pages/Online.tsx`, `Rooms.tsx`, `Watch.tsx`; `frontend/src/lib/run-api.ts`, `room-api.ts`, `play-client.ts`, `watch-client.ts` |
| Run dan WS server | `backend/src/routes/runs.ts`, `rooms.ts`, `backend/src/services/runSession.ts`, `runs.ts`, `rooms.ts`, `backend/src/ws/` |
| Recovery | `frontend/src/lib/run-checkpoint.ts`, `run-launch.ts`, `run-summary.ts`, `play-client.ts` |
| Pembelian | `frontend/src/lib/voucher-api.ts`, `frontend/src/pages/Garage.tsx`, `backend/src/routes/vouchers.ts`, `backend/src/services/vouchers.ts`, `ledger.ts` |
| Chain | `backend/src/chain/live.ts`, `ports.ts`, `mock.ts`, `voucherTypes.ts`, `backend/src/services/chainEvents.ts` |
| ABI/deployment | `packages/config/deployments/monad-testnet.json`, `packages/config/src/deployments.ts`; periksa keberadaan source `contract/` sebelum mengasumsikannya tersedia |
| Aturan/protokol | `packages/config/src/`, `packages/sim/` |
| Integrasi/regresi | `backend/test/frontend.integration.test.mjs`, `backend/test/privy.test.ts`, `runs.test.ts`, `rooms.test.ts`, `vouchers.test.ts`, `chain-events.test.ts`; tes FE yang berdekatan dengan source |

## Yang sudah tersedia — jangan dibangun ulang

- Google-only login lewat SDK Privy dan embedded Ethereum wallet; App ID publik sudah tersedia di konfigurasi contoh. Tidak perlu extension wallet untuk jalur Google.
- Verifier server memakai `jose`, memvalidasi token ES256, issuer, audience, expiry, lalu lookup embedded wallet lewat Privy dan mengikat DID/wallet ke SQLite.
- Endpoint akun, room, run, voucher, summary/log, serta WS pemain dan penonton sudah diimplementasikan. Akses publik penonton tetap disengaja.
- Seed `run.go` otoritatif; duplicate/reconnect tidak me-reset runner; watermark final dikirim sebelum `run.end`; summary memeriksa finalHash.
- Reconnect selama halaman masih hidup, buffer input, serta pemulihan hasil yang terlewat sudah tersedia.
- Adapter voucher memvalidasi respons dan tidak otomatis mengulangi POST yang hasilnya tidak diketahui. Ini reservasi, belum transaksi pembelian.
- Pembacaan kontrak live sebagian tersedia. Relayer, indexer, dan signer live masih stub; `start()` live sengaja gagal. File deployment bersama masih berisi nilai null dan ABI kosong pada snapshot ini.
- UI Garage terbaru, lima aset mobil, tema terang/gelap, viewer 3D, serta game lokal sudah dikerjakan. Pertahankan desain, aset, navigasi, dan interaksinya. CTA utama Garage saat ini menuju latihan Starter, bukan memilih tier online secara otomatis.

Bukti sebelumnya: empat skenario integrasi memakai Fastify HTTP/WS, verifier JWT, dan SQLite asli; **lookup user Privy serta chain memakai fixture/MockChain**. Tes tersebut membuktikan batas server lokal, bukan OAuth Google atau transaksi testnet. Verifikasi redesign terakhir mencatat 112 unit FE, typecheck/build, dan pemeriksaan browser lulus; jalankan pemeriksaan yang relevan untuk tree baru, jangan menyalin angka lama sebagai hasil eksekusimu.

## Enam pekerjaan tersisa

### 1. Login Google nyata sampai akun game aktif

**Target:** pengguna baru login Google, mendapatkan embedded wallet, dan membaca akun `/me` yang cocok dengan identitas terverifikasi.

- Periksa env/dashboard: Google login, pembuatan embedded wallet, allowed origins, public origin dan CORS yang sesuai URL pengujian. `localhost` dan `127.0.0.1` jangan dianggap origin yang sama.
- Backend memerlukan `PRIVY_APP_ID`, `PRIVY_VERIFICATION_KEY`, dan `PRIVY_APP_SECRET`; frontend hanya ID publik dan konfigurasi API/WS. Jangan mencetak/memasukkan secret ke chat, dokumen, log, browser bundle, atau Git.
- App Secret pernah dibagikan dalam percakapan: pengguna perlu merotasinya lewat dashboard dan memasang secret baru hanya di backend/secret store. Jangan menyalin secret lama dari riwayat.
- Uji dua akun Google nyata A/B, provisioning wallet, token kedaluwarsa, logout, login ulang, dan account switch saat request masih berjalan. Abaikan respons terlambat milik identitas sebelumnya.
- Pertahankan wallet-ready terpisah dari auth-ready; jika provisioning belum siap, sediakan recovery sesuai flow yang sudah ada tanpa mengganti identitas pengguna.

**Selesai bila:** kedua akun memiliki wallet/akun server masing-masing; A tidak dapat mengoperasikan resource B dengan mengganti ID; anonymous/token invalid ditolak pada operasi terlindungi tanpa mutasi; logout/switch tidak membocorkan saldo atau state akun lama. Bukti OAuth nyata wajib dipisahkan dari pengujian token fixture.

**Dependensi eksternal:** akses dashboard, secret baru, verification key, dan tindakan login Google oleh pemilik akun. Jika belum tersedia, selesaikan konfigurasi serta tes lokal yang bisa dikerjakan dan tandai acceptance nyata `BLOCKED`.

### 2. Alur lengkap FE dengan backend dan identitas nyata

**Target:** Google → `/me` → buat room → buat/start run → penonton bergabung → tiga gangguan → hasil server.

- Jalankan backend dengan database pengujian tersendiri. Konfigurasi FE `VITE_DATA_MODE=live`, `VITE_API_URL`, dan `VITE_WS_URL`; contoh backend default port 8080. Samakan origin dengan port Vite yang benar-benar aktif.
- Untuk tahap ini backend boleh `CHAIN_MODE=mock` dan `SEED_SOURCE=local`; tampilkan mode dengan jujur. **FE live hanya berarti memakai backend; bukan chain live.** Hash/blok mock bukan bukti transaksi Monad.
- Verifikasi seed, countdown, input/seq, watermark final, hasil/finalHash, saldo pending/reserved/available, dan konsistensi REST/WS. Gunakan shared sim, jangan membuat perhitungan tandingan di FE.
- Uji NITRO, SPIKES, RED beserta warning/ack, cooldown/limit sesuai config, late message, duplicate, disconnect/reconnect, dan terminal result yang terlewat.
- Pertahankan enforcement kepemilikan room/run di server; public watch/read tetap publik sesuai DTO dan aturan yang sudah ada.

**Selesai bila:** perjalanan tersebut berhasil dengan identitas Privy nyata dan server sebenarnya, hasil dapat dibaca kembali tanpa kredit ganda, penonton tidak memperoleh hak kontrol pemilik, dan pengujian A/B serta kegagalan jaringan tercatat. Pengujian lintas perangkat dilengkapi pada pekerjaan 6.

### 3. Implementasi dan integrasi Monad testnet

**Target:** hasil dan mepet terverifikasi benar-benar tercatat, lalu dibaca kembali dari chain.

- Cocokkan pembagian tugas Bayu/Dharu di `TASKS.md`. Periksa progres source/branch sebelum menulis ulang pekerjaan tim. Pada snapshot lokal, kontrak belum di-deploy menurut README dan manifest deployment masih kosong.
- Dapatkan atau implementasikan source kontrak sesuai scope tim, ABI final, alamat deployment, deploy block, RPC, chain ID, dan explorer. Jika informasi belum tersedia, tulis dependensi spesifik; jangan mengarang alamat/ABI atau menambahkan fallback mock pada mode live.
- Lengkapi port relayer start/near-miss/end, indexer event, dan signer voucher EIP-712 di `backend/src/chain/live.ts` mengikuti kontrak final.
- Relayer perlu antrean/nonce/retry yang aman dan status transaksi terpantau; indexer perlu cursor/replay/deduplikasi dan pemulihan restart. Pastikan lifecycle run, saldo/ledger, kelulusan, serta kepemilikan ter-update dari sumber yang tepat tanpa kredit ganda.
- Periksa domain/chain/contract/nonce/expiry voucher dan otorisasi attester/signer. Uji receipt gagal, event terlambat/duplikat, RPC putus, dan recovery sesuai finalitas chain yang dipakai.
- Pertahankan pemisahan hasil simulasi terverifikasi dengan status recorded/failed on-chain. Jangan menganggap broadcast hash sebagai receipt sukses.

**Selesai bila:** unit/integrasi jalur gagal lulus, mode live tidak memakai MockChain, dan acceptance testnet memiliki tx hash, receipt sukses, event yang cocok dengan run, rekonsiliasi ledger, serta kecocokan audit/finalHash. Jika transaksi/deployment belum diotorisasi pengguna, siapkan perubahan dan runbook lalu tandai acceptance eksternal tertunda.

### 4. Pembelian mobil sampai kepemilikan tersinkron

**Target:** pengguna yang memenuhi syarat dapat membeli tier dengan voucher, lalu kendaraan dan saldo diperbarui dari hasil kontrak.

- Gunakan reservasi backend dan adapter voucher yang sudah tersedia. Harga, syarat mepet/tier, suplai, serta kepemilikan mengikuti shared config dan kontrak; jangan percaya nilai harga/owner kiriman FE.
- Hubungkan embedded wallet Privy dengan transaksi kontrak final `buy()`; periksa chain dan signature voucher sesuai ABI yang benar. Hindari membuka pembelian dari saldo contoh.
- Implementasikan lifecycle reservasi → permintaan persetujuan → broadcast → receipt → event/indexer → refresh `/me` dan suplai. Integrasikan state seperlunya ke desain Garage yang ada.
- Tangani reject, revert, insufficient MON, wrong chain, voucher expired, double click, account switch, indexer lambat, serta reload ketika tx pending. Simpan referensi recovery seperlunya; jangan simpan token atau secret.
- Hasil POST/broadcast ambigu harus direkonsiliasi sebelum mengulang. Deduplikasi debit, nonce, dan event di boundary yang benar; jangan mengkredit atau mengklaim kepemilikan lokal sebelum bukti server/chain.
- Verifikasi sifat soulbound dan aturan caller/lifecycle di kontrak, bukan hanya tombol transfer yang disembunyikan.

**Selesai bila:** pembelian sah satu kali menghasilkan receipt/event dan tier dimiliki, hanya satu debit/reservasi yang diselesaikan, pembelian tidak sah/replay ditolak tanpa mutasi, dan refresh tetap menunjukkan keadaan benar. Butuh pekerjaan 1 dan 3 untuk acceptance testnet.

### 5. Recovery setelah refresh, lintas tab, dan POST ambigu

**Target:** pengguna mendapat hasil pemulihan yang konsisten tanpa membuat run baru atau dua pengendali secara tidak sengaja.

- Bedakan reconnect pada halaman yang masih hidup (sudah ada) dengan full reload (saat ini hanya membaca summary). Input/sim state tidak otomatis ada kembali setelah reload.
- Tentukan kontrak pemulihan dengan server: state/checkpoint atau replay otoritatif, input terakhir yang di-ack, seq, seed, startAt/tick, event gangguan, batas grace, serta siapa yang boleh melanjutkan.
- Jika full resume melampaui scope atau bertentangan dengan PRD baseline, dokumentasikan keputusan bersama pengguna/tim. Jangan menjanjikan resume hanya dengan menyimpan run ID. Pemulihan ke hasil/timeout yang jujur tetap perlu bekerja.
- Selesaikan penemuan run milik akun ketika `POST /runs` mungkin berhasil tetapi respons hilang, misalnya endpoint lookup terotorisasi/idempotency key yang disepakati. Jangan retry create membabi buta.
- Cegah dua tab mengirim input untuk run yang sama dengan enforcement otoritas server; sinkronisasi tab FE hanya pelengkap. Perpindahan akun tidak boleh melanjutkan run akun sebelumnya.
- Jangan menyimpan access token/raw input sensitif dalam localStorage untuk menambal recovery. Tetapkan data minimum dan validasi ulang identitas/state pada server.

**Selesai bila:** refresh/disconnect pada fase CREATED, countdown, RUNNING, dan terminal menghasilkan resume yang terbukti atau hasil akhir yang eksplisit; tidak ada reset seed, seq ganda, run/debit ganda, atau takeover akun/tab lain. Tes POST berhasil-respons hilang dan dua tab wajib ada.

### 6. Validasi perangkat, operasional, dan kesiapan demo

**Target:** sistem dapat dijalankan ulang dan dibuktikan di lingkungan demo yang sebenarnya.

- Siapkan env example tanpa secret dan runbook FE/backend/DB, CORS, Privy origins, HTTPS/WSS, RPC, kesehatan layanan, serta pemulihan kegagalan. Backend saat ini memakai state run/room dalam memori dan SQLite: deployment awal harus satu instance dengan storage persisten; jangan scale horizontal tanpa desain state bersama.
- Verifikasi restart backend: bedakan data persisten dari run aktif yang hilang; tentukan timeout/penyelesaian reservasi dan pesan recovery agar tidak menggantung atau menggandakan saldo.
- Uji laptop demo dan minimal tiga HP penonton nyata: kontrol/rem lepas, audio setelah interaksi, performa selama run, semua gangguan, jaringan terputus, join/leave, dan hasil. Emulasi browser serta bot bukan bukti perangkat fisik.
- Uji kapasitas penonton tambahan menggunakan script yang tersedia bila relevan, tanpa menganggap tiga HP atau 50 bot otomatis membuktikan semua kondisi deployment.
- Jalankan pemeriksaan workspace, integrasi, build FE, serta Docker/CI yang relevan. Periksa hasil CI remote hanya bila tersedia; jangan mengklaim lulus dari keberadaan file workflow saja.
- Siapkan skenario demo dan cadangan, akun presenter yang memenuhi syarat lewat permainan sah, serta checklist bukti login/run/penonton/recorded/pembelian/soulbound/audit. Jangan meluluskan akun dengan mengubah saldo atau bot.

**Selesai bila:** checklist perangkat dan lingkungan target berisi bukti PASS/FAIL/BLOCKED, known gaps tertulis, runbook dapat diikuti, dan acceptance testnet/pembelian memiliki bukti nyata. Jika akses hosting, perangkat, atau izin publikasi belum ada, siapkan kandidat lokal dan jelaskan batasnya.

## Urutan pengerjaan dan batas tindakan

1. Inventaris tree dan dependensi, lalu kerjakan 1 dan 2. Mulai dari backend asli dengan chain mock agar integrasi akun dan multiplayer bisa dituntaskan tanpa menunggu chain.
2. Kerjakan kontrak recovery/POST ambigu (5) dan persiapan pengujian/runbook (6) pada bagian yang tidak bergantung chain. Koordinasikan perubahan protokol melalui shared config serta kedua sisi client/server.
3. Lengkapi 3 setelah source/ABI dan scope tim jelas, lalu 4. Jangan menahan seluruh pekerjaan lokal hanya karena credential atau deployment belum tersedia.
4. Jalankan acceptance lintas alur dan perangkat (6) sesudah komponen siap.

Otorisasi handoff ini mencakup implementasi dan verifikasi lokal dalam scope enam pekerjaan, dengan menjaga pekerjaan yang sudah ada. **Handoff ini tidak memberikan izin baru untuk push/publish, merge ke main, deployment, memakai dana, atau mengirim transaksi.** Siapkan perubahan yang bisa direview dan minta otorisasi spesifik bila tindakan eksternal tersebut diperlukan dan belum diizinkan langsung oleh pengguna. Login Google/akses dashboard menggunakan akun pengguna dilakukan dengan keterlibatan pemilik akun. Jangan mengirim pesan ke anggota tim tanpa instruksi pengguna.

Jangan mendesain ulang Garage, mengganti aset/font/tema, mengubah ekonomi/aturan untuk memudahkan demo, atau menginstal ulang SDK tanpa kebutuhan yang terbukti. Perubahan UI kecil untuk status transaksi/recovery boleh mengikuti design system yang ada. Jangan stage/commit seluruh working tree: pisahkan perubahan Kiro dari pekerjaan lokal sebelumnya dan ikuti otorisasi Git pengguna.

## Pengujian dan bukti yang diharapkan

Mulai dengan script yang benar-benar ada; jangan mengasumsikan runner baru diperlukan:

```powershell
Set-Location C:\Belajar\Sem5\Momonad
pnpm typecheck
pnpm test
pnpm --filter @racing-gang/frontend build
```

Untuk diagnosis terarah gunakan `pnpm --filter @racing-gang/backend test`, `pnpm --filter @racing-gang/frontend test`, serta script `test:network`, `test:rooms`, `test:results`, `test:service`, `test:garage`, dan `test:practice` di frontend sesuai perubahan. Baca kebutuhan env/browser/server di script sebelum menjalankan. Jangan menjalankan suite mahal berulang tanpa perubahan atau kegagalan baru yang membenarkannya.

Backend menyediakan script `bot`, `spectators`, `status`, `check-monad`, dan `audit`; lihat README untuk argumen. Gunakan DB/akun pengujian, jangan data pengguna. Bot SIWE perlu konfigurasi dev tersendiri dan tidak menggantikan acceptance Google.

Untuk auth/pembelian/recovery, uji handler dan server/kontrak sebenarnya dengan dependency eksternal terkontrol bila perlu. Minimal: actor sah berhasil; anonymous/expired token ditolak; akun B tidak bisa memakai resource A; field buyer/owner/saldo palsu ditolak; penolakan tidak mengubah state; duplicate/replay/unknown outcome aman. Mock verifier authorization tidak membuktikan ownership. Build dan login berhasil saja tidak membuktikan authorization atau transaksi.

## Laporan akhir Kiro

Perbarui status terbaru di `.context/FRONTEND_PLAN.md` tanpa menghapus sejarah, dan tulis hasil sistem di `.context/SYSTEM_IMPLEMENTATION.md`:

- Ringkasan perubahan beserta file/kontrak/protokol yang terpengaruh.
- Tabel enam pekerjaan: `DONE`, `PARTIAL`, atau `BLOCKED`, dengan acceptance yang sudah dan belum terbukti.
- Perintah verifikasi, hasil aktual, dan lokasi bukti yang sudah disanitasi. Pisahkan unit, integrasi lokal, layanan Privy nyata, perangkat fisik, serta Monad testnet.
- Tx hash/receipt/event hanya jika benar-benar berasal dari testnet; jangan memuat token, credential, atau data pribadi akun uji.
- Dependensi spesifik yang masih dibutuhkan dari pengguna/Bayu/Dharu, risiko operasional yang ditemukan, dan langkah lanjut paling kecil.
- Status Git dan file yang sudah berubah sebelum Kiro mulai; jangan mengklaim perubahan agent sebelumnya sebagai pekerjaan baru.

Jelaskan kemajuan dan keputusan penting secara ringkas dalam bahasa Indonesia. Jangan menandai seluruh sistem selesai bila Google nyata, chain, pembelian, atau acceptance perangkat masih tertunda.
