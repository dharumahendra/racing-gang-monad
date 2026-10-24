# Integrasi FE setelah deployment kontrak — 23 Oktober 2026

## Implementasi

- raka/foundation disinkronkan fast-forward dengan main e015678, termasuk PR #6/#7, kontrak, manifest final dan layanan chain. Tidak ada transaksi atau perubahan key.
- Pembelian memakai manifest Bayu tanpa ABI karangan. Tes kompatibilitas memeriksa ABI CarNFT final.
- QR lokal di room host berisi URL spectator untuk origin yang sedang dibuka, tanpa layanan QR eksternal. Kode/link tetap tersedia.
- /audit/:id memakai auditRun dari packages/sim, log publik backend, getRun dan event RunStarted/NearMiss/RunEnded dari RunRegistry. RPC dicek chain ID; event dibaca dalam rentang kecil dan terbatas seperti CLI audit Bayu.
- Hasil cocok hanya jika run kontrak sudah berakhir, seed dan final hash tersedia. Bukti hilang tidak dianggap sukses. Audit memakai pembacaan saja, tidak meminta wallet.
- Empat metadata public/cars/1.json–4.json dan PNG sesuai model tier tersedia. image relatif masih perlu dijadikan URL HTTPS permanen sebelum folder dikirim untuk setBaseURI.
- Halaman mengikuti komponen/style existing; verifikasi visual diserahkan ke pengguna.

## Hosting metadata (URL belum diberikan)

Dari frontend:
1. Ekspor ulang PNG jika aset mobil berubah: jalankan Vite lokal lalu NFT_RENDER_ORIGIN=<origin> node scripts/export-nft-images.mjs (PowerShell: set env var terpisah). Endpoint scripts/metadata-render.html hanya alat development; bukan halaman aplikasi produksi.
2. Setelah domain ditentukan: node scripts/prepare-nft-metadata.mjs https://DOMAIN/cars/
3. Build dan publikasikan public/cars bersama FE. Pastikan /cars/1.json–4.json dan /cars/1.png–4.png tersedia publik. Jangan arahkan fallback SPA ke file metadata yang hilang.
4. Kirim URL folder HTTPS ke Bayu untuk setBaseURI. Belum dihosting dan belum ada perubahan on-chain pada sesi ini.
5. Lisensi gambar turunan mengikuti frontend/LICENSES.md: Tier1–3 Unity Fan, Tier4 Khronos Car Concept CC BY4.0; atribusi disertakan pada metadata Tier4 dan dokumentasi.

## Koneksi backend (URL dan key belum tersedia)

- Pemilik backend memasang attester/voucher signer key langsung pada server dan mengaktifkan chain live. FE tidak menyimpan key dan tidak mengubah env backend.
- Setelah URL backend tersedia, dari frontend jalankan: node scripts/configure-backend.mjs https://API-DOMAIN
- Script hanya memperbarui VITE_DATA_MODE/API_URL/WS_URL di env lokal; ID Privy yang sudah ada dipertahankan. HTTPS otomatis memakai WSS. Restart Vite/rebuild hosting.
- Isi VITE_RPC_URL bila RPC default bermasalah. Manifest sudah menunjuk Monad testnet10143.
- Allowed origins Privy dan CORS backend harus memuat domain FE. QR pada localhost tidak bisa dipakai HP; demo memerlukan origin yang dapat diakses HP.
- FE live masih boleh terhubung backend mock; pembelian tetap diblok berdasarkan health chainMode.
- Tanpa URL/key, koneksi layanan live belum dapat diaktifkan atau diklaim berhasil.

## Verifikasi

Hasil aktual dicatat sesudah tes/typecheck/build pada akhir sesi. Tidak ada audit visual, OAuth nyata, transaksi, publikasi hosting, atau setBaseURI.


### Hasil akhir

- Typecheck frontend PASS.
- 25 tes terarah PASS: pembelian18, validasi/kompatibilitas ABI3, integrasi audit4. Replay asli, RPC/fetch terkontrol; tidak mengklaim pengujian chain nyata.
- Build produksi PASS (Vite 1m40s); warning PURE dependency dan ukuran chunk tetap ada.
- Script konfigurasi/metadata lolos node --check. Empat PNG diekspor 1024x1024; tidak dinilai secara visual.
- Diff source bersih dari whitespace error. Perubahan belum di-commit/push. Working tree lama test-results dan script test-cam tetap dijaga.
- Hosting metadata dan pengaktifan layanan backend live tertunda sampai domain/endpoint diberikan. Belum ada publikasi atau transaksi.
