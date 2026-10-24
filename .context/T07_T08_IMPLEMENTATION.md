# T07/T08 — Room host dan penonton frontend

22 Oktober 2026 WIB. Source: C:\Belajar\Sem5\Momonad\frontend, branch raka/foundation. Basis origin/main e814b30 dan branch server bbc7e3c tetap. Backend/config/sim/ABI tidak diubah. Belum ada commit/push/merge/deployment/transaksi atau pesan ke tim.

## Yang tersedia

- Host membuat room dengan token Privy segar, tanpa mengirim wallet/owner sebagai bukti. Kode dan tautan publik dapat disalin. Jumlah penonton dan status run diperbarui GET setiap 3 detik saat foreground, tanpa membuka socket penonton untuk host.
- Tombol mulai membawa roomCode ke POST /runs lewat /online?room=CODE. Respons terlambat setelah logout/ganti akun/unmount diabaikan. POST yang hasilnya ambigu tidak diulang otomatis.
- Penonton masuk dengan kode dan nick opsional, tanpa login atau wallet. WS hanya membawa room/nick. Nitro, Rantai dan Red Zone memakai biaya/lajur/durasi dari shared config; energi selalu berasal dari server, tanpa debit atau regen lokal.
- Satu kiriman aktif pada satu waktu. accepted berarti server menerima, bukan pasti diterapkan. Penolakan ENERGY/LIMIT/RATE/NO_RUN/ROOM_EXPIRED memiliki feedback; socket putus atau timeout tidak mengulang gangguan.
- Pergantian run memerlukan sambung ulang supaya snapshot/result tanpa runId dari socket lama tidak mengisi run baru. Room kedaluwarsa menghentikan gangguan baru tetapi tetap membaca hasil run aktif, termasuk ketika kiriman terakhir belum diketahui.
- Panel menampilkan snapshot publik, gangguan scheduled, receipt yang didedup dan hasil server. Nick dirender sebagai teks. Tidak mengkredit saldo, memberi qualification, atau mengklaim chain dari simulasi.
- Visual mengikuti design system cream/biru/hijau dan aset low-poly yang sudah dipilih. Halaman HP diuji 390px; tidak menambahkan aset baru, kamera kabin atau live 2D penonton opsional.
- /dev/rooms menguji komponen yang sama dengan transport simulasi. Rute/module/token fixture dihapus dari produksi.

## Status dan batas akses

T07/T08: FE ADAPTER READY / LIVE INTEGRATION BLOCKED. T06 pembelian dilewati sementara karena membutuhkan voucher/ABI/backend. Estimasi 50 jam tetap baseline, bukan timesheet aktual.

| Aktor/aksi | Kebutuhan enforcement |
| --- | --- |
| Host POST /rooms | Backend memverifikasi token Privy dan menentukan identitas pemilik |
| Host POST /runs dengan roomCode | Room milik identitas yang sama, belum kedaluwarsa, satu run aktif, mobil yang dimiliki; tolak user B yang mengganti kode milik A |
| Publik GET /rooms/:code dan WS /watch | Sengaja publik; DTO terbatas, tanpa private profile/token |
| Penonton disrupt | Backend menegakkan energi, rate/capacity, expiry, lane/duration dan lifecycle run; jangan percaya tombol FE |

Branch dharu/server yang diperiksa belum menyediakan room/run/watch atau verifier Privy. App ID publik akan disediakan pengguna. Gate UI dan test transport bukan bukti ownership server. Tidak ada secret ditambahkan.

## Verifikasi

- Salinan akhir diverifikasi dengan hash: 16 file FE/harness berubah, baseline target cocok sebelum copy; dependency/lockfile tidak berubah tahap ini.
- Unit FE langsung di Momonad: **70 PASS** (17 room/watch, 53 regresi lama). Termasuk single-flight, no retry/replay, energi server pecahan, invalid input, disposal, pergantian run, dan expiry sambil pending.
- Review independen read-only menemukan expiry saat pending bisa menutup stream hasil. Diperbaiki dengan dua regresi RED→GREEN: error expiry server dan timeout sesudah expiry lokal.
- Typecheck PASS dan build produksi PASS (Vite 3m55s) langsung di Momonad. Warning dependency PURE annotation serta chunk besar masih ada: Privy sekitar 1,55 MB dan Three sekitar 1,23 MB sebelum gzip. Ini bukan build bebas warning atau bukti performa demo.
- Pemeriksaan JS produksi PASS: route, endpoint dan token fixture room/network/golden tidak masuk bundle.
- Browser room: 12 kelompok PASS, dua konteks penonton, satu POST create, 11 GET publik, console error/warning 0. Pending expiry melewati timeout lalu tetap menerima hasil run. Regresi browser umum 10 kelompok PASS (termasuk golden3 dan tujuh model), jaringan 10 kelompok PASS. HUD/audio 11 kelompok PASS setelah perbaikan harness. Total browser **43 kelompok PASS** (room12 + regresi10 + jaringan10 + HUD11), error/warning console 0. Golden3 termasuk dalam 10 regresi, tidak dihitung lagi.

Test bukan bukti Privy Google/embedded wallet live, ownership lintas akun di server, kapasitas 50 penonton, chain/receipt nyata, atau performa/audio perangkat demo. Satu guard CRLF sim bawaan pernah gagal pada tahap sebelumnya; shared sim tidak diubah dan full-workspace green tidak diklaim.

## Jalankan dan lanjutkan

Dari root Momonad: pnpm --filter @racing-gang/frontend dev. Mode contoh tetap menyediakan latihan. Untuk live, isi VITE_PRIVY_APP_ID, VITE_API_URL, VITE_WS_URL dan VITE_DATA_MODE=live setelah layanan siap. App Secret/private key tidak ditempatkan di VITE_*.

Dengan dev server aktif, jalankan pnpm --filter @racing-gang/frontend test:rooms. Output test-results berisi rooms-report.json serta screenshot host-room, watch-room-mobile dan host-expired-active. Fixture bukan server demo persisten: harness Playwright memasang transport selama test.

Langkah selanjutnya: siapkan recovery/hasil T09 pada batas FE yang tersedia. Integrasi live perlu endpoint recovery run aktif/hasil, verifier Privy, room/watch/run dan indexer backend; pembelian T06 perlu ABI/voucher kontrak. Acceptance bersama nanti harus menguji host A, user B dan penonton anonim lewat handler nyata, termasuk penolakan tanpa mutasi dan reconnect tanpa replay.

## Catatan stabilitas harness

Regresi umum sempat timeout pada countdown ketika build berjalan; pengulangan berurutan setelah build PASS, tanpa perubahan gameplay. Penyebab timeout pertama belum dibuktikan secara khusus. Sampel browser setelah build 60 rAF/detik bukan acceptance performa seluruh run/perangkat demo.

Harness HUD lama menunggu input keyboard lalu mencari locator dengan atribut countdown=2 dan memakainya lagi untuk ikon. Trace DOM membuktikan SPIKES=2 dirender pada 11.441ms, menjadi 1 pada 12.032ms lalu hilang pada 13.072ms; oscillator 440/550 Hz dijadwalkan, console tanpa error. Locator dapat sudah berubah ketika pemeriksaan berikutnya berlangsung. Harness sekarang mengamati DOM sebelum interaksi dan menyimpan warning yang benar-benar dirender beserta ikon/label. Durasi game/audio tidak diubah. Ini tambahan file ke-16; hash baseline harness target cocok sebelum copy.
Fixture overlap juga dikirim saat run.ready untuk tick35, sehingga tetap mematuhi jarak aktivasi minimal 30 tick dari tick3 tanpa bergantung pada waktu screenshot. Observer menyimpan jumlah warning yang benar-benar dirender bersamaan. Konfigurasi/sim tetap tidak diubah.
Coin pop juga direkam ketika node DOM benar-benar tampil, termasuk nilai koin dan computed animationName untuk reduced motion; pemeriksaan tidak bergantung pada efek tetap ada setelah interaksi mute/screenshot.

Hasil final HUD native: satu AudioContext per run; frekuensi Rantai 440/550Hz, Red Zone 330/412,5Hz, Nitro660/825Hz; semua context ditutup saat navigasi. Ini pengujian penjadwalan API headless, bukan pendengaran speaker. Harness diperbaiki tanpa perubahan source/gameplay, sehingga build/unit yang sudah lulus tetap berlaku.
