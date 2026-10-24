# Handoff terakhir — Racing Gang untuk Kiro

Snapshot: 24 Oktober 2026. Kamu bekerja di folder lokal yang sama: `C:\Belajar\Sem5\Momonad`.
Fokus: memahami sisa pekerjaan FE dan mengerjakan yang tidak bergantung pada keputusan tim. Deploy bukan scope handoff ini.

## Mulai dari kondisi nyata

- Repo baru: https://github.com/dharumahendra/racing-gang-monad
- Branch aktif: `raka/modification`, tracking `origin/raka/modification`.
- HEAD saat handoff: `66f23f1` (Bangun Balap sebagai Starter gratis). Sebelum file ini dibuat, working tree bersih.
- `origin/main` terakhir yang diperiksa: `347d9b9`; ada dua commit baru tentang deployment kontrak Bayu yang belum masuk branch ini. Dry-run merge tidak konflik. Fetch ulang sebelum integrasi; snapshot bukan jaminan remote tetap sama.
- CI pada HEAD tersebut lulus: workspace typecheck/test/build, Forge + backend live anvil, dan Docker backend. Bukti lokal terakhir: 182 tes FE, typecheck dan build lulus. Ini tidak membuktikan alur live atau tampilan perangkat.
- Periksa status/diff dan AGENTS.md terlebih dahulu. Terapkan skill `C:/Users/hp5cd/.agents/skills/github-test-authorization/SKILL.md`.
- Baca dokumen seperlunya: `.context/PRD.md`, `.context/TECH_SPEC.md`, bagian akhir `.context/FRONTEND_PLAN.md`. Catatan lama memuat blocker yang sudah selesai; kode dan perubahan terbaru lebih menentukan status aktual.

## Yang sudah dibangun — jangan diulang

React/Vite + Privy Google/embedded wallet; Garage dan pemilihan mobil; Practice dan online; kontrol tahan kiri/kanan/gas/rem; pelepasan kontrol saat blur/tab pindah; input yang ditahan saat countdown diterapkan pada GO; peringatan kendaraan belakang; viewport balap tanpa scroll; landscape PBR; host room/QR; penonton dan gangguan; hasil run; feed on-chain; audit publik `/audit/:id`; pembelian voucher → simulasi → wallet → receipt → refresh `/me`, stok dan pemulihan transaksi setelah reload.

Sim/config dari tim sudah CONFIG_VERSION 3 dengan gas manual. Jangan kembali ke aturan akselerasi otomatis di PRD lama. Jangan ubah ekonomi, hitbox atau aturan sim demi tampilan.

Model truk berlabel **SATUAN P BALAP / BANGUN** adalah tampilan Starter gratis (tier 0, bukan NFT). Model Tier 1–4 tetap utuh. Empat aset koleksi tambahan tersedia sebagai GLB + PNG; dua model Sketchfab sudah diunduh dan dibundel, walau handoff NFT lama masih mengatakan belum.

## Sisa pekerjaan, berurutan

### 1. Sinkronisasi manifest kontrak dari main — prioritas pertama

Integrasikan main terbaru ke branch kerja setelah memeriksa perubahan. Jangan hardcode alamat baru di komponen atau menimpa pekerjaan lokal.

Update main yang sudah terlihat: deployBlock `73733089`, RunRegistry `0xe3c8edd37798d5e03553e4f6df191bc8586adaca`, CarNFT `0xd8a134916c85ace413289eaf674aedcd984ba736`, chainId `10143`. Gunakan manifest terbaru `packages/config/deployments/monad-testnet.json` sebagai sumber kebenaran, bukan menyalin snapshot ini secara buta.

Selesai jika branch memuat update dan FE tetap membaca deployment dari shared config. Jangan mengirim transaksi untuk memverifikasinya.

### 2. Seed Practice masih hardcode — perbaikan FE yang bisa langsung dikerjakan

Bukti: `frontend/src/pages/Practice.tsx` mendefinisikan konstanta `seed`; Retry hanya mengganti `attempt`, lalu memakai seed yang sama.

Buat seed baru untuk setiap percobaan latihan, termasuk Retry, dengan format yang diterima shared Sim. Seed harus stabil selama percobaan itu berlangsung, tidak berubah karena render ulang. Gunakan sumber acak browser yang sesuai dan tes perilaku tersebut tanpa tes acak yang flaky.

Hanya Practice yang diubah. Online tetap menggunakan seed otoritatif backend/chain. Koin latihan tidak boleh menjadi saldo resmi.

### 3. Leaderboard FE — fitur P1 yang backend-nya sudah siap

Backend: `backend/src/routes/leaderboard.ts`, `GET /leaderboard?limit=20`, limit 1–100, response `{ entries: [{ runId, player, carTier, nearMisses, endedAt }] }`. Gunakan tipe `LeaderboardResponse` dari shared protocol.

Belum ada halaman, adapter atau navigasi leaderboard di FE. Implementasikan sesuai desain aplikasi sekarang: ranking, alamat singkat, tier, jumlah mepet, dan tautan hasil/audit. Tangani loading, kosong, error dan pembatalan request. Tetap publik tanpa mewajibkan login. Skor dari backend tidak otomatis berarti seluruh pencatatannya sudah final on-chain; jangan memberi label yang melebihi datanya.

### 4. Metadata NFT — sebagian menunggu domain

- Tier 1–4: `frontend/public/cars/1.json`–`4.json` dan PNG sudah ada. Field image masih relatif. Script yang SUDAH tersedia: jalankan dari `frontend`, `node scripts/prepare-nft-metadata.mjs https://DOMAIN/cars/` setelah domain permanen diberikan.
- Koleksi tambahan: `frontend/public/collectibles/` memiliki katalog, model, gambar, viewer, dan `drafts/1.json`–`4.json`. Generator final SUDAH ada: dari `frontend`, `node --import tsx scripts/collectibles/prepare.mjs https://DOMAIN/collectibles/`.
- Jangan mengarang domain/URL produksi atau memakai draft sebagai metadata final. Setelah URL publik benar-benar tersedia, serahkan folder baseURI Tier 1–4 ke Bayu. Memanggil setBaseURI bukan tugas FE ini.

### 5. Koleksi NFT tambahan — menunggu keputusan produk + kontrak Bayu

Minecart, truk, burger, dan boatmobile baru memiliki aset/preview. Belum ada mint/claim, kepemilikan koleksi atau indexing-nya di aplikasi.

Sebelum implementasi transaksi, sepakati ERC-721/1155, suplai, gratis/berbayar/reward, transferability, penerbit/claimant, pencegahan klaim ganda, dan ABI/alamat kontrak terpisah. Setelah itu baru FE membuat halaman koleksi/mint dan menghubungkan data kepemilikan yang benar.

Jangan menambah tier, memakai buy() Tier 1–4 untuk koleksi ini, atau mengarahkan baseURI CarNFT yang ada ke metadata koleksi tambahan: itu akan mengganti artwork mobil tier. Jangan mengarang ABI atau menganggap katalog ID 1–4 sebagai token yang sudah dimint. Otorisasi penerbitan/claim harus ditegakkan kontrak/server, bukan tombol FE.

### 6. Audio tambahan — P1

`frontend/src/lib/warning-audio.ts` hanya menghasilkan nada peringatan gangguan. Suara mesin dan efek mepet belum ada. Jika dikerjakan, gunakan event/kecepatan sim, audio baru aktif setelah gesture, hormati mute, berhenti saat tab tersembunyi/akhir run/unmount, dan catat lisensi aset bila memakai file eksternal.

### 7. Demo soulbound dan resume penuh — opsional, bukan blocker build inti

- Belum ada tombol “Coba transfer” di FE. Larangan transfer sudah ada di kontrak. Tentukan flow demo dengan Bayu; jangan mencoba transfer nyata otomatis.
- Reconnect singkat tanpa reload sudah ada. Setelah reload, pengguna bisa memeriksa hasil/status tetapi gameplay tidak dilanjutkan. Resume penuh perlu kontrak recovery backend (log/snapshot, urutan input, kepemilikan controller). Jangan hanya menyimpan state lokal lalu menganggapnya otoritatif; jangan simpan token di storage untuk itu.

## Yang perlu dibuktikan, bukan dibangun ulang

Login Google dua akun dan isolasi sesi; run live → Qualified → pembelian Tier 1 → saldo terpotong sekali/Owned setelah reload; pemulihan transaksi pending; room dengan beberapa HP; putus jaringan 5 detik; audit run live; performa/audio di laptop/HP setelah landscape dan truk baru. Google login pernah dilaporkan berhasil oleh backend, tetapi acceptance lintas akun belum dibuktikan di sesi ini.

Verifikasi visual dilakukan pengguna. Jangan menjalankan browser screenshot/QA visual atau pengujian berulang yang mahal tanpa kebutuhan baru. Jangan menandai checklist live selesai hanya karena unit test/CI hijau.

## Cara bekerja hemat dan batas scope

Kerjakan 1 → 2 → 3 dahulu. Item 4–5 jangan dipaksakan tanpa domain/keputusan kontrak; 6–7 setelah prioritas tersebut bila diminta atau waktu cukup. Ajukan pertanyaan hanya saat benar-benar membutuhkan keputusan itu, sambil melanjutkan pekerjaan independen.

Jangan baca seluruh repo berulang atau merapikan dokumen lama. Gunakan pencarian terarah, tes regresi proporsional, lalu typecheck/build bila kode berubah. Contoh dari root: `pnpm --filter @racing-gang/frontend test -- src/lib/NAMA.test.ts`, `pnpm --filter @racing-gang/frontend typecheck`, `pnpm --filter @racing-gang/frontend build`. Jalankan suite lebih luas hanya jika dampak perubahan memerlukannya.

Jaga .env/key/token tetap lokal. Jangan cetak isinya. Pertahankan backup migration/stash dan file kerja pengguna. Jangan force-push/reset/clean. Jangan commit/push, membuat atau merge PR, deploy, mint, transfer, atau menjalankan transaksi tanpa instruksi pengguna yang berlaku untuk sesi pengerjaanmu.

Di akhir laporkan perubahan, bukti pemeriksaan yang benar-benar dijalankan, dan dependency/gap yang tersisa. Tidak perlu mengubah semua .md historis untuk laporan.
