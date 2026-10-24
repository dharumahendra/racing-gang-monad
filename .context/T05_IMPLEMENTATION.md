# T05 — HUD, warning audio dan feed frontend

22 Oktober 2026 WIB. Source: `C:\Belajar\Sem5\Momonad\frontend`, branch `raka/foundation`. Shared backend/config/sim, statistik, hitbox, input log dan aturan game tidak diubah. Tidak ada commit/push, merge, deployment, transaksi atau pengiriman pesan kepada tim.

## Perubahan yang bisa digunakan

- HUD bersama untuk latihan dan run online: waktu, kecepatan, mepet/koin lokal, target tier dan status gas/rem/nitro/melambat. Target memperhatikan mobil yang dipakai serta `minCarTier`: Starter dengan 150 mepet tidak ditampilkan memenuhi Tier 2. Pencapaian lokal tidak menjadi qualification resmi.
- Semua gangguan yang sedang memberi aba-aba ditampilkan bersama, bukan hanya gangguan pertama. Nama, ikon, lajur dengan nomor manusia 1–4, dan countdown berasal dari warning 60 tick shared sim. Nitro menunjukkan semua lajur dan ketika aktif menjelaskan bahwa rem diabaikan.
- Penanda warning di scene berkedip satu siklus per detik. Red zone aktif tetap solid. Preferensi reduced motion membuat cue lajur statis dan menonaktifkan animasi coin pop; nama/ikon/countdown tetap terlihat.
- +100/+200 memakai event NEAR_MISS asli yang ditangkap runner setiap tick, sehingga event tidak hilang ketika renderer melewati beberapa tick sekaligus. Ini koin lokal; tidak menambah saldo server.
- Audio sintetis Web Audio: rantai 440/550 Hz, red zone 330/412,5 Hz, nitro 660/825 Hz. Dua nada pendek per tahap countdown, dengan gain rendah serta envelope pendek. Tidak ada file audio eksternal, musik, engine sound atau akses mikrofon.
- AudioContext baru dibuat/resume setelah klik Mulai latihan, Hubungkan run atau tombol suara. Ada mute/unmute, preferensi lokal, penanganan browser tanpa audio, pembatalan ketika tab tersembunyi/run berakhir/navigasi, dan perlindungan terhadap unlock async yang selesai setelah unmount.
- Audio terkait identitas warning serta deadline aktivasi: nada tidak dijadwalkan melewati sisa waktu warning, dan voice dibatalkan ketika warning tidak lagi pending. Tahap lama tidak dibunyikan bertubi-tubi setelah frame tertunda atau unmute.
- Feed online menggabungkan `nearMiss.verified` dan `nearMiss.recorded` menurut index, termasuk receipt yang mendahului verified dan pesan duplikat. Ditampilkan status, jumlah koin menurut server bila tersedia, blok, latensi dan tautan tx HTTPS dengan `noopener noreferrer`. Maksimal enam row terbaru; jumlah event keseluruhan tetap terlihat.
- `PRODUCT.md` mendokumentasikan keputusan produk/desain yang sudah ada: pemain laptop, penonton HP, Google/Privy, Quaternius, peringatan multisensorik dan pembedaan bukti lokal/server/chain. Tidak mengganti design system.

## Status cakupan

FE-3 lokal dan adapter tampilan tersedia. FE-5 **belum live**: belum ada backend run/WS/indexer aktif atau App ID Privy untuk alur nyata. Feed pada browser test diisi event server simulasi yang diberi label development; tidak ada transaksi atau saldo nyata yang dibuat. Endpoint terlindungi dan kepemilikan run tetap perlu enforcement server sesuai `PRIVY_AUTH_HANDOFF.md` dan `T04_IMPLEMENTATION.md`.

Hasil lokal, verified dan recorded tetap terpisah. Tidak ada penambahan saldo atau qualification berdasarkan efek HUD, bunyi atau receipt client. Refresh profil saat ini mengikuti focus/jeda berkala dari runtime Privy; belum ada refresh yang dipicu khusus oleh receipt.

## Verifikasi

Test baru diamati RED sebelum implementasi, lalu GREEN. Review independen menemukan satu bug audio deadline; dua test regresinya juga diamati RED sebelum diperbaiki, kemudian GREEN.

- Verifikasi akhir langsung di Momonad: **53 unit FE PASS**, terdiri atas 12 tambahan T05 dan 41 test sebelumnya. T05 mencakup target tier, seluruh warning/countdown, event sim, feed out-of-order/dedup, URL tx, gesture, repeat cue, mute, hidden/end/cleanup, unsupported API, late unlock, voice expiry dan deadline.
- **Typecheck dan build produksi PASS**, build selesai dalam 1 menit 51 detik. Pemeriksaan bundle memastikan token/endpoint/route fixture development tidak masuk produksi. Warning dependency PURE dan chunk besar tetap ada.
- Browser HUD/audio diperiksa dengan native AudioContext di Edge headless serta transport REST/WS simulasi. Konteks tidak dibuat sebelum gesture; frekuensi, oscillator start/stop serta close context diukur. Ini bukti scheduling Audio API, bukan bukti pendengaran/volume speaker laptop demo.
- **Browser HUD/audio 11 kelompok PASS di Momonad**: tiga jenis warning, peringatan bersamaan, mute/unmute tanpa replay lama, reduced motion, +200 dari sim, feed/tautan, layout HP, status nitro, unsupported API dan cleanup. Tiga konteks audio (satu per skenario jenis gangguan) dibuat setelah gesture dan semuanya ditutup saat navigasi. Console error/warning 0.
- **Browser jaringan 10 kelompok dan latihan/garasi 10 kelompok PASS di Momonad**, termasuk tiga golden fixture. Console error/warning 0 dan tujuh model asli termuat. Total 31 kelompok browser; ini bukan 31 test otorisasi server.
- Sampel rAF singkat terakhir 46 FPS saat build dan browser berjalan pada host yang sama. Angka ini tidak menjadi acceptance performa perangkat demo; pengukuran satu run penuh masih belum dilakukan.

Satu timeout pada test reconnect lama muncul saat browser berjalan bersamaan dan tidak terulang saat dijalankan sendiri. Diagnostik status/wire message ditambahkan; fixture menahan rem saat screenshot/reconnect agar pengujiannya tidak bergantung pada lama capture. Ini tidak mengubah game atau menyatakan penyebab timeout pertama sudah terbukti. Test overlap awal juga diperbaiki agar pesan fixture mempunyai lead time, sesuai kebutuhan protokol; pesan yang datang terlambat memang harus ditolak.

## Review dan batas yang masih ada

- Important fixed: voice yang masih terjadwal ketika warning berubah aktif. Voice sekarang memiliki key warning; update menghapus voice kedaluwarsa dan penjadwalan dibatasi remainingMs dikurangi accumulator runner. Dua regresi membuktikan pembatalan serta tidak adanya nada kedua melewati deadline.
- Minor deferred: copy feed menyebut saldo dibaca ulang setelah pencatatan, sementara refresh profil saat ini berdasarkan fokus/interval 60 detik, belum receipt-triggered. UI tidak mengkredit saldo; wording/refresh terukur perlu diperjelas saat integrasi layanan nyata.
- Tidak dinilai sebagai selesai: pendengaran fisik/volume, performa laptop demo sepanjang satu run, backend/Privy/chain live, otorisasi server serta isu recovery controller T04 di luar scope.
- Warning ukuran bundle Three/Privy dan anotasi PURE dari dependency masih diketahui. Guard sim CRLF bawaan dari tahap sebelumnya tidak diperbaiki atau dinyatakan lulus; shared source tidak berubah.

Keputusan: pertahankan arah visual/aset yang disepakati dan kerjakan FE secara lokal/kontrak. Jika kebutuhan branding berubah perlu klarifikasi; jika backend berbeda dari kontrak, adapter harus diuji ulang. Menganggap feed fixture sebagai saldo/chain nyata akan menyesatkan, sehingga aktivasi live tetap menunggu layanan dan bukti server.

## Cara mencoba dan berikutnya

Preview latihan sesi ini: `http://127.0.0.1:5174/play`. Klik Mulai latihan untuk membuka audio, gunakan panah/A/D dan bawah/S, lalu tombol Suara aktif untuk mute. Peringatan NPC berasal dari sim; tidak ada gangguan atau hasil palsu yang ditambahkan ke latihan.

```powershell
pnpm --filter @racing-gang/frontend test
pnpm --filter @racing-gang/frontend build
# Vite sudah berjalan; sesuaikan APP_URL bila port berbeda:
pnpm --filter @racing-gang/frontend test:hud
pnpm --filter @racing-gang/frontend test:network
pnpm --filter @racing-gang/frontend test:browser
```

Implementasi mengikuti [praktik Web Audio MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices): buat/resume konteks dari gesture dan sediakan kontrol suara.

Selanjutnya tetap dua jalur: konfigurasi Privy + verifier/run/WS/indexer dari backend untuk membuktikan T04/T05 live, serta playtest audio/performa pada perangkat demo. Jika layanan belum siap, adapter room/penonton dapat dilanjutkan terhadap protokol yang ada tanpa mengklaim room atau transaksi nyata.
