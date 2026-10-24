# T02 — Fondasi Frontend Racing Gang

Status pemeriksaan: 22 Oktober 2026, WIB. Branch lokal: `raka/foundation`, berbasis `origin/main` commit `e814b30` saat pekerjaan dimulai. Tidak ada commit, push, transaksi wallet, atau deployment yang dilakukan.

## Hasil

- Source aplikasi ada di `C:\Belajar\Sem5\Momonad\frontend`.
- Vite 7 + React 19 + TypeScript; React Router; wagmi v2/viem; zustand; TanStack Query untuk provider wallet.
- Garasi dengan lima pilihan preview mobil dan statistik dari `@racing-gang/config` tim. Model mobil masih ilustrasi CSS, bukan model Quaternius.
- Rute `/`, `/play`, `/room`, `/watch`, `/watch/:code`, `/run/:id`, dan halaman tidak ditemukan.
- Form penonton publik: normalisasi/validasi kode, nick opsional, kontrol preview lajur/durasi. Tidak membuat room atau mengirim gangguan palsu.
- Saldo mock diberi label; fitur yang menunggu backend/chain dinonaktifkan. Mode live tidak fallback otomatis ke mock jika request gagal.
- Wallet injected + perpindahan ke Monad testnet + client SIWE ke `/auth/nonce`, `/auth/verify`, `/me`. Token hanya memory dan baru diterima setelah profil cocok dengan akun yang menandatangani.
- Account/chain change, disconnect, expiry, signature rejection dan respons async lama ditangani. Watch tidak mensyaratkan wallet.
- `.env.example`, README, test unit, dan script pemeriksaan browser tersedia di frontend.

## Pembaruan dari tim

Saat awal pemeriksaan source lokal masih dokumen. Fetch menemukan `origin/main` baru berisi workspace, config/protocol, simulasi dan golden fixtures Dharu. Branch FE dibuat dari basis baru, bukan membuat paket config/sim tandingan.

Source protokol sekarang menetapkan nomor blok/seedBlock sebagai number, bigint uint256 sebagai string; room startAt nullable; bentuk `/me` dan ringkasan run sudah tersedia. SimView aktual mempunyai `redLanes` berbentuk objek, `coins`, `endReason`, dan kendaraan dengan x/z/w/l. Implementasi berikutnya wajib mengikuti ekspor ini, bukan menyalin draft T01 lama.

Remaining review: seed fallback ke event, kanal update host sebelum run, recovery/ack lifecycle, domain/header SIWE terhadap server nyata, dan kesiapan ABI/deployment. Server backend saat ini baru kerangka package/workspace, belum layanan SIWE aktif.

## Bukti verifikasi

| Pemeriksaan | Hasil |
|---|---|
| Frontend unit | 11/11 PASS: 8 kasus sesi, 3 adapter API |
| Typecheck frontend | PASS |
| Typecheck seluruh workspace | PASS: config, sim, frontend, backend |
| Build produksi frontend | PASS; build terakhir tanpa warning Rollup setelah import injected dipersempit |
| Browser Edge headless | PASS 9 kelompok pemeriksaan; console error=0, warning=0 |
| Viewport | Desktop 1440×1000 dan mobile 390×844; tidak ada overflow horizontal pada layar yang diperiksa |
| Config tests | 9/9 PASS |
| Sim tests | 36 PASS, 1 FAIL pada guard komentar bawaan; golden replay 4/4 PASS |
| Backend workspace test | 1/1 PASS; ini test kerangka workspace, bukan API/otorisasi server |
| Total unit seluruh package yang dijalankan | 57 PASS, 1 FAIL; suite workspace belum hijau penuh |
| Source target vs source teruji | Hash seluruh file src identik saat penyalinan; shared packages tidak diubah |

Browser memeriksa pemilihan kartu mobil, validasi dan normalisasi kode, join tanpa wallet, pemilihan lajur preview, tombol gangguan yang belum aktif, deep link `/play`, `/room`, `/run/demo`, `/watch/INVALID` dan 404. Screenshot desktop dan HP telah dilihat untuk QA visual. Tidak ada pengujian performa game 3D karena game belum dibuat.

### Kegagalan bawaan: guard determinisme CRLF

File: `packages/sim/test/determinism-guard.test.ts`.

Test memecah source dengan `split('\n')`, lalu menghapus komentar dengan regex `/\/\/.*$/`. Pada checkout Windows, sisa `\r` membuat regex tidak menghapus komentar. Akibatnya kalimat komentar di sim.ts yang menyebut `Math.random/Date.now` dilaporkan sebagai pemanggilan terlarang.

Probe langsung pada source menunjukkan `endsWithCR=true`, `rawFlags=true`, dan `normalizedFlags=false` setelah CR dihapus. SHA256 sim.ts di target dan arsip upstream teruji sama: `9D573238DA35172EF421788BC09942B484B9C2E9858A52F7D5DCE64BF5DABBC3`.

Ini false positive guard pada CRLF, bukan bukti pemanggilan acak baru dari FE. Kode/test sim tidak diubah dalam task FE. Usulan untuk Dharu: normalisasi pemisahan baris menjadi `/\r?\n/` dan tambahkan kasus komentar CRLF/LF agar guard tetap mendeteksi pemanggilan sungguhan. Usulan ini belum diterapkan.

### Catatan dependency

Install memperingatkan peer React pada dependency transitif WalletConnect/valtio yang ikut paket connectors wagmi v2. Aplikasi saat ini hanya memakai injected yang diekspor langsung dari wagmi, tidak memakai AppKit/WalletConnect. Warning install tersebut tetap ada; bukan warning console browser. Review versi/connector diperlukan sebelum menambah WalletConnect.

## Batas selesai T02

Fondasi UI, adapter, state dan verifikasi FE tersedia. Login nyata belum dapat diverifikasi sampai Dharu menyediakan SIWE server dan origin yang diizinkan. Belum ada WS play/watch, scene R3F, run sungguhan, voucher/buy, status NFT, atau aset final. Frontend tidak menjadi bukti otorisasi server/kontrak.

Kamera belakang wajib; kabin opsional setelah acceptance P0. Tidak ada perubahan anggaran 50 jam. Durasi tabel plan tetap perkiraan, bukan timesheet dari durasi proses tool/install yang sempat tertunda.

## Menjalankan dari proyek

```powershell
cd C:\Belajar\Sem5\Momonad
pnpm install
pnpm --filter @racing-gang/frontend dev
```

Buka `http://127.0.0.1:5173`. Detail environment dan command test ada di `frontend/README.md`. VITE_API_URL diperlukan untuk SIWE nyata; private key bukan variabel frontend.

Pada handoff sesi ini, server dari lokasi proyek final berjalan di `http://127.0.0.1:5174`. Pemeriksaan browser juga diulang ke URL ini dan PASS. Port 5173 pada command README tetap port default jika belum digunakan proses lain.

## Langkah berikut: T03

1. Import SimView dan Sim aktual dari `@racing-gang/sim`.
2. Buat runner fixed-step 30 Hz, antrean keyboard tick+1, dan dua snapshot untuk interpolasi.
3. Jalankan golden fixtures resmi Node vs browser di halaman dev.
4. Render empat lajur, kamera belakang, player dan traffic dengan placeholder R3F.
5. Baru inventaris/konversi satu model Quaternius untuk menguji skala/pivot/material, tanpa mengubah hitbox config.

Review akhir tahap ini adalah self-review. Tidak ada reviewer independen atau pesan yang dikirim ke anggota tim.
