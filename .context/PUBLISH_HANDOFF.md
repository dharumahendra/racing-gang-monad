# Verifikasi sebelum commit dan push FE

22 Oktober 2026 WIB. Permintaan pengguna: simpan pekerjaan frontend dalam **15 commit** dan push branch `raka/foundation` ke origin. Basis remote yang diperiksa: `origin/main` pada `e814b30`; branch tujuan belum ada di remote saat pemeriksaan. Catatan ini merekam verifikasi sebelum publikasi, bukan klaim merge atau deployment.

## Konfigurasi Privy

- App ID publik: `cmviy1ioq027u0gjjyqt4vypt`, dipasang di `frontend/.env.example` agar tim dapat menyalinnya ke `.env.local`.
- `.env.local` lokal sudah disiapkan dan di-ignore Git. Mode data tetap mock; URL backend/WS dan Client ID kosong.
- Tidak ada App Secret dalam source atau Git. Secret yang sempat dikirim lewat chat perlu dirotasi melalui dashboard Privy dan hanya boleh digunakan pada backend bila diperlukan.
- Browser Edge dengan SDK nyata menerima HTTP200 untuk konfigurasi app serta embedded-wallet endpoint. SDK ready, tombol Google aktif, tidak ada pageerror.
- Belum login Google menggunakan akun nyata, membuat embedded wallet atau membuktikan verifier/otorisasi backend. Dashboard Google dan origin yang dipakai tetap perlu diuji saat login nyata. Preview lokal `http://127.0.0.1:5174`; default dev5173.

## Bukti pemeriksaan

- 91 unit frontend PASS dalam14file.
- Typecheck PASS; build produksi PASS dalam1menit18detik dengan App ID baru. Warning dependency PURE annotation Privy/ox dan chunk besar tetap ada.
- Browser regresi tanpa App ID memakai server tes terpisah di5176:10kelompok PASS termasuk3golden, tujuh model mobil, tiga scenery, countdown, pindah lajur dan rem; console error/warning0. Mode tanpa App ID sengaja diuji terpisah agar fallback tetap terbukti.
- T10 sebelumnya memverifikasi31kelompok browser serta renderer48kendaraan selama100detik; bukti dan batas pengukurannya ada di T10_IMPLEMENTATION.md. Pengukuran performa itu tidak diulang untuk perubahan env/dokumen ini.
- Pemeriksaan source mencakup file yang dialokasikan, kandidat secret dan env lokal yang di-ignore. Ini pemeriksaan lokal proporsional, bukan audit keamanan menyeluruh.
- Shared backend/config/sim tidak diubah. Full-workspace green tidak diklaim karena guard sim terhadap CRLF pernah menghasilkan false positive.

## Pembagian commit

1. Pemindahan spesifikasi ke .context dan handoff awal.
2. React/Vite/TypeScript, dependency dan lockfile.
3. Google Privy/session isolation dan tesnya.
4. Runner deterministik dan kontrol.
5. REST/WS run, watermark, reconnect dan tesnya.
6. Host room dan monitoring.
7. Penonton publik dan gangguan.
8. Hasil/receipt/status recovery.
9. HUD, warning, audio dan feed.
10. Mobil Quaternius, manifest, lisensi dan converter.
11. Instancing traffic/scenery dan jalan.
12. Routing, garasi, latihan, online dan fixture development.
13. Harness browser/regresi/performa.
14. Plan, README, lisensi dan laporan implementasi.
15. App ID publik, handoff Privy dan catatan verifikasi ini.

Commit memakai identitas Git anggota tim yang sudah dikonfigurasi. Source/asset dikelompokkan menurut bagian pekerjaan; tidak memakai commit kosong atau backdate. Hasil push, jumlah commit dan kesetaraan hash remote diperiksa setelah rangkaian commit. Merge ke main, PR, deployment dan transaksi tidak termasuk permintaan ini.
