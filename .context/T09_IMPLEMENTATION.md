# T09 — Hasil run dan pemulihan status frontend

22 Oktober 2026 WIB. Source: C:\Belajar\Sem5\Momonad\frontend, branch raka/foundation; origin/main e814b30 dan server bbc7e3c. Backend/config/sim/ABI serta lockfile tidak diubah tahap ini. Tidak ada commit/push/merge/deployment/transaksi atau pesan kepada tim.

## Perubahan

- Halaman `/run/:id` memakai kontrak publik GET /runs/:id. Tidak meminta token/wallet untuk membaca. Lifecycle (dibuat/siap/berjalan/selesai), hasil gameplay (menunggu/VERIFIED/PARTIAL/INVALID) dan status chain (PENDING/RECORDED/RECORD_FAILED) tampil terpisah.
- Daftar mepet memuat tick, jenis kendaraan, koin per entri, tx hash dan blok; tautan explorer HTTPS memakai noopener/noreferrer. Daftar ditampilkan 20 entri lalu dapat diperluas. Total koin dari daftar bukan saldo akun; kelulusan tidak disimpulkan dari jumlah mepet. Tidak ada kredit saldo/qualification lokal.
- Polling GET 3 detik saat foreground, maksimal 90 detik atau sampai hasil akhir dan chain RECORDED. Tombol Perbarui status tetap bekerja setelah otomatis berhenti. Respons salah ID, rusak, metadata berubah atau lifecycle ENDED mundur tidak menggantikan data lama; error menandai data terakhir sebagai stale. Request dibatalkan dan respons terlambat dibuang saat pindah rute.
- ConfigVersion berbeda dapat dilihat sebagai ringkasan dengan peringatan; tidak menjalankan replay. Payload harus tetap cocok bentuk protokol yang dikenali frontend.
- Setelah POST run berhasil, URL online menyimpan `?run=ID` sambil mempertahankan roomCode. Hanya ID publik; tidak menyimpan token, input atau snapshot di storage. Setelah reload/sesi berubah, halaman memeriksa status saja, tanpa mengirim POST baru atau menyambung kontrol dari data yang tidak lengkap.
- Ketika run berakhir lokal tetapi WS result terlewat, panel online dapat membaca summary REST. Hasil WS, ringkasan REST, dan hasil lokal tetap terpisah; tidak mengulang input untuk mendapatkan hasil.
- Same-page reconnect memakai buffer FIFO T04. Batas offline 30 detik kini diperiksa sebelum token, sesudah token, dan saat socket open; socket gagal sebelum open tidak menggeser deadline outage pertama. Buffer tidak dikirim setelah grace berakhir.
- `/dev/results` dan opsi `/dev/network?summary=1` adalah harness transport simulasi. Fixture tidak merupakan backend atau akun demo live.

## Akses dan dependensi

| Aksi | Batas akses |
| --- | --- |
| GET /runs/:id | Sengaja publik sesuai TECH_SPEC §5.1; backend hanya mengirim DTO publik |
| POST /runs dan WS play | Backend tetap harus memverifikasi Privy dan kepemilikan pemain/run; ID di URL bukan bukti izin |
| Pembacaan status setelah reload | Read-only; tidak membuat run, tidak mengubah saldo dan tidak melanjutkan kontrol |
| Pelanjutan gameplay setelah reload/cross-tab | Belum tersedia; perlu endpoint active-run, log/snapshot/watermark/ack/replay server yang disepakati |

Jika respons POST /runs hilang tanpa ID, frontend tetap tidak membuat ulang otomatis. GET /me saat ini tidak memiliki activeRun sehingga menemukan run tersebut memerlukan tambahan kontrak backend. Server/Privy/indexer nyata belum siap; App ID pengguna masih ditunggu. Ini kesiapan FE, bukan bukti ownership lintas akun atau chain live.

## Verifikasi

- TDD adapter summary9 dan URL checkpoint2, serta empat regresi grace reconnect RED→GREEN. Source T04 sebelumnya memiliki tiga jalur membuka socket lewat grace dan satu reset deadline saat reconnect gagal; seluruh jalur diuji.
- Typecheck staging dan Momonad PASS; suite T09 28 test PASS. **Seluruh 85 unit FE PASS langsung di Momonad** (15 tambahan T09, 70 regresi). Build produksi Momonad PASS (Vite 2m03s). Warning PURE annotation dari dependency Privy/ox dan chunk besar masih ada (Privy sekitar 1,55MB, Three sekitar 1,24MB sebelum gzip). Fixture results/room/network/golden tidak ditemukan pada JS produksi. **Browser akhir langsung di Momonad: 31 kelompok PASS** (hasil11 + jaringan10 + regresi10 termasuk golden3), console error/warning0. Outage5s membuktikan sim terus maju dan antrean mendahului watermark tanpa POST run kedua.
- Staging browser hasil11 kelompok PASS, GET publik tanpa bearer, 0 POST otomatis, console error/warning0. Termasuk CREATED/RUNNING/ENDED, PARTIAL+chain gagal, chain pulih tanpa promosi gameplay, wrong-run/stale/malformed, versi config berbeda, HP390, pagination, polling disposal, hasil WS hilang dibaca REST.
- Review independen read-only selesai; tidak ada temuan penting setelah fix deadline. Tidak mengklaim review/test server yang belum tersedia.

Pengujian ini bukan real-service acceptance. Full-workspace green tidak diklaim; guard CRLF sim bawaan pernah gagal sebelumnya dan shared sim tidak diubah. Warning dependency Privy/ox serta ukuran chunk akan dicatat pada hasil build. Pendengaran speaker dan performa penuh perangkat demo tetap memerlukan playtest.

## Menjalankan

Dari root Momonad, gunakan pnpm --filter @racing-gang/frontend dev; lalu test:results dan test:network dengan APP_URL sesuai port Vite. Sediakan VITE_DATA_MODE=live, VITE_API_URL, VITE_WS_URL dan VITE_PRIVY_APP_ID setelah layanan siap. App Secret/private key tidak masuk VITE_*.

Status T09: FE STATUS RECOVERY READY / LIVE RECOVERY INTEGRATION BLOCKED. Reload hanya memulihkan pembacaan status; bukan resume gameplay. T06 pembelian tetap menunggu voucher/ABI/backend. Estimasi 50 jam tetap baseline, bukan timesheet aktual.

Berikutnya: T10 pengukuran scene ramai/penyetelan render dan kesiapan aset yang dapat dilakukan lokal. Acceptance sistem T11 serta alur pembelian/mepet/qualification/soulbound perlu backend/chain dan Privy nyata. Jangan menyatakan P0 demo end-to-end selesai dari fixture FE.

Alur authenticated production create→checkpoint→reload belum diuji dengan Privy nyata. Browser memverifikasi URL publik/reload tanpa POST dan helper checkpoint diuji unit; pemeriksaan sumber/review memastikan account key membuang client lama. Ini tidak menggantikan pengujian akun A/B dengan verifier backend.

Verifikasi penyalinan: 17 file FE/harness scoped; hash baseline target cocok sebelum copy dan hash akhir source/target cocok. README diperbarui dengan pemeriksaan hash sebelum salinan lanjutan. Tidak ada dependency baru. Laporan/plan disimpan di .context.

Sampel rAF headless regresi terakhir30/detik; tujuh model dan golden3 tetap lulus. Sampel pendek Edge headless bukan acceptance50–60FPS untuk run100detik di perangkat demo. T10 perlu pengukuran terkontrol scene ramai serta tuning; perubahan FPS tidak diatribusikan ke T09 tanpa profiling.
