# T10 — aset scene dan optimasi renderer

22 Oktober 2026 WIB. Source di `C:\Belajar\Sem5\Momonad\frontend`, branch `raka/foundation`, basis main `e814b30`. Status: **LOCAL ASSETS/RENDER READY; ACCEPTANCE PERANGKAT DEMO MASIH PENDING**. Estimasi 50 jam tetap baseline, bukan timesheet aktual.

## Perubahan

- Aset asli PineTree_1 dan Rock_1 dari [Ultimate Nature](https://quaternius.com/packs/ultimatenature.html), serta Streetlight_Single dari [Modular Streets](https://quaternius.com/packs/modularstreets.html) dipakai di scene. Dua lisensi CC0 asli, URL sumber, hash OBJ/MTL/GLB dan converter disimpan. Tiga GLB menambah 240.088 byte; tujuh model Cars sebelumnya tetap sama.
- Konversi menyesuaikan pivot, skala seragam dan warna daylight. Palet biru/cream/hijau muted dipertahankan. Road tile Streets tidak diimpor: jalan empat lajur, marka dan curb tetap procedural sesuai config. Truk/SPIKES masih procedural; kabin opsional belum dibuat.
- Traffic memakai empat pool InstancedMesh dengan vertex color hasil bake pada salinan geometri; scenery memakai tiga pool. Marka menggunakan matriks tetap dan offset global. Interpolasi traffic lookup sekali berdasarkan ID. Hanya objek di luar jangkauan visual yang dicull; sim/log/hitbox/config tidak diubah.
- Bake menolak mesh animasi/morph, material transparan atau tekstur; material group, transform mirrored dan geometri sumber dilindungi enam unit test. Batas kapasitas pool mengikuti batas generator bersama dan gagal eksplisit jika dilampaui. Original GLB tidak dimutasi.
- `/dev/performance` adalah fixture visual 48 kendaraan, tanpa sim.step, input, POST, WS, saldo atau hasil. Probe mencatat GPU aktual, frame time, draw call, triangle, geometry dan jumlah instance. Fixture/probe tidak termasuk produksi.

## Pengukuran

Edge headless pada GPU **Intel Iris Xe melalui ANGLE D3D11** di host ini. Flag fallback SwiftShader tidak memaksa GPU software. Warm-up 3 detik, viewport desktop 1440×1000, canvas DPR1 1202×600. Fixture 48 kendaraan dan HUD/warning sama; hasil sesudah juga memuat detail scenery baru.

| Sampel | Durasi | FPS rata-rata | Draw call median | Frame p95 | Frame terburuk |
|---|---:|---:|---:|---:|---:|
| Baseline sebelum optimasi | 8 dtk | 60,05 | 610 | 32,7 ms | 42,2 ms |
| Sesudah, staging | 100 dtk | 59,90 | 27 | 19,6 ms | 171,8 ms |
| Sesudah, DPR2 (canvas cap1,4) | 8 dtk | 58,31 | 27 | 20,7 ms | 218,0 ms |
| Sesudah, viewport HP390×844 | 8 dtk | 60,05 | 27 | 17,1 ms | 24,4 ms |
| Sesudah, Momonad akhir | 100 dtk | 60,00 | 27 | 19,50 ms | 53,30 ms |

Median draw call turun **95,57%** (610→27), melewati budget penurunan minimal50% yang terbukti gagal sebelum perubahan. Geometry baseline187 menjadi27, dengan rentang27–30 selama sampel100detik. Keempat pool berisi12 instance masing-masing: seluruh48 kendaraan tetap dirender. Triangle median justru meningkat122.564→185.052 karena detail scenery; pengurangan draw call bukan pengurangan traffic. Tidak ada console error/warning, POST atau overflow pada pengukuran ini.

FPS baseline sudah mendekati refresh60Hz; tidak ada klaim FPS naik berlipat. Durasi sampel berbeda dan spike terburuk masih ada, sehingga tidak disimpulkan semua stutter hilang. Geometry stabil100detik bukan bukti tidak ada kebocoran semua resource sepanjang sesi. Profil ini **bukan** acceptance gameplay100detik, audio speaker, mobile fisik atau demo di perangkat nyata.

Profil akhir Momonad100detik: 60,00FPS, frame p95 19,50ms, terburuk 53,30ms; draw call median 27, seluruh48 instance, geometry 27–30, console bersih dan0POST.

## Verifikasi source akhir

**Langsung pada source akhir Momonad:** 91 unit FE PASS (14 file); typecheck PASS; build produksi PASS (1m55s). Browser31 kelompok PASS: regresi10 termasuk golden3, jaringan10 termasuk outage5detik, HUD/audio11. Console bersih; tujuh model mobil dan tiga scenery termuat. Skrip HUD asli lulus pada rerun tanpa perubahan. Pemeriksaan JS produksi memastikan route/probe/fixture development tidak masuk bundle. Hash/ukuran ketiga GLB dan enam sumber OBJ/MTL sesuai manifest; seluruh aset Cars lama tidak berubah.

Build masih memberi warning dependency PURE annotation Privy/ox serta chunk besar (Three sekitar1,24MB dan Privy1,55MB sebelum gzip). Tidak ada dependency baru. Optimasi ini berfokus pada render; waktu cold load dan bundle belum dinyatakan tuntas.

Ada timeout navigasi awal saat profil staging dan satu percobaan HUD target (page load30detik). Pemeriksaan HTTP halaman/modul/GLB memberi200 dalam0,003–0,047detik pada pemeriksaan HUD; rerun dengan pencatatan request/event load menyelesaikan empat navigasi dan11assertiongroup tanpa error. Penyebab timeout awal tidak terbukti dan tidak disamarkan dengan perubahan timeout/assertion skrip asli. Rerun skrip HUD asli kemudian PASS tanpa perubahan; timeout awal tetap dicatat sebagai kejadian yang belum diketahui penyebabnya.

Review independen read-only tidak menemukan masalah penting setelah membandingkan source, metadata GLB dan screenshot. Review tidak menjalankan profil tambahan atau mengukur unmount berulang. Enam unit baru mencakup transform/bounds/warna, topology/material group, facing mirrored/hidden, penolakan texture/transparent/normalMap dan pose/culling/immutability; kegagalan RED yang relevan diperbaiki sebelum GREEN.

18 file frontend disalin dengan hash baseline sebelum copy dan hash source/target sesudah copy. Dependency/lockfile, backend, shared config/sim dan pekerjaan lokal lain tidak diubah. Root test workspace tidak diklaim green: guard komentar CRLF sim memiliki false positive yang sudah dicatat. Tidak ada commit/push/merge/deploy/transaksi/pesan tim.

Koreksi dokumentasi T09: istilah “sampel pendek SwiftShader” diganti “sampel pendek Edge headless”, karena GPU T09 tidak dicatat. GPU Intel hanya terukur pada profil T10 ini, bukan disimpulkan untuk sampel lama.

## Menjalankan dan selanjutnya

Dari root repo, jalankan `pnpm --filter @racing-gang/frontend dev`. Dengan Vite aktif, `test:performance` memakai APP_URL dan PERF_SECONDS=100. PERF_LABEL memberi nama laporan; PERF_DPR=2 atau PERF_MOBILE=1 mengubah kondisi. PERF_BASELINE menunjuk JSON baseline jika ingin memeriksa budget draw call. Baca README/LICENSES untuk detail dan provenance.

Berikutnya T11: checklist QA lintas alur, triase gap dan playtest manual100detik pada laptop demo (kontrol, audio terdengar, HUD dan stutter). T12 dapat menyiapkan runbook demo/handoff lokal. Live acceptance tetap menunggu App ID Google/embedded wallet Privy, verifier/backend room/run/WS/recovery/indexer dan ABI/voucher pembelian T06. Fixture FE tidak membuktikan enforcement ownership, kapasitas penonton, saldo/qualification/soulbound atau transaksi testnet. Release publik memerlukan instruksi pengguna tersendiri.
