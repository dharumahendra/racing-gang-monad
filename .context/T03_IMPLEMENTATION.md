# T03 — latihan 3D, aset asli, dan persiapan Privy

22 Oktober 2026 WIB. Source disimpan di `C:\Belajar\Sem5\Momonad\frontend`, branch `raka/foundation`. Tidak ada commit, push, deployment, atau transaksi.

## Hasil implementasi

- `/play` sekarang menjalankan latihan lokal dengan shared `packages/sim`: fixed step 30 Hz, input tick+1, interpolasi renderer, countdown, pindah lajur, rem, HUD dan hasil lokal. Kamera belakang mengikuti mobil. Sim berhenti setelah run berakhir.
- Latihan memakai Starter dan seed tetap untuk reproduksi. Latihan tidak membuat run backend, mengirim hasil resmi, menambah saldo, atau memberikan qualification.
- Garasi memakai lima model Quaternius asli untuk lima tier. Traffic menambahkan Taxi dan Cop, sehingga tujuh model asli dimuat. OBJ/MTL diubah menjadi GLB dengan warna material sumber; total sekitar 1,8 MB. Sumber, CC0, transformasi dan manifest dicatat di `frontend/LICENSES.md` serta folder aset.
- Palet cream, biru, dan hijau mengikuti mobil serta lingkungan low-poly. Model mobil CSS T02 telah diganti. Jalan, pohon sederhana, truk dan spikes masih geometri dari kode; Modular Streets, Ultimate Nature dan dashboard belum diimpor. Kamera kabin tetap opsional dan belum dibuat.
- `/dev/golden` hanya tersedia saat development dan menjalankan tiga fixture resmi. Hash, event, tick, jumlah dan alasan akhir dibandingkan dengan expected fixture; tidak sekadar membandingkan gambar.

## Login sesuai keputusan pengguna

SDK `@privy-io/react-auth` 3.50.0 sudah dipasang. Provider memakai Google melalui modal Privy dan embedded Ethereum wallet pada Monad testnet. Pengguna tidak perlu extension wallet. Provider baru dimuat ketika App ID tersedia; App ID kosong menampilkan penjelasan dan latihan tetap dapat digunakan.

Token diambil melalui `getAccessToken()` untuk membaca `/me`. FE membersihkan profil ketika logout atau identitas berubah dan menolak respons lama maupun profil dengan wallet berbeda. Token tidak dipersist sebagai sesi game buatan. Ini pemeriksaan lifecycle FE, bukan bukti otorisasi server.

Pengguna akan membuat app di dashboard Privy. `.env.example` sudah menyediakan `VITE_PRIVY_APP_ID`, opsional `VITE_PRIVY_CLIENT_ID`, dan URL backend. Jangan memasukkan App Secret ke frontend. Detail dashboard, env dan kontrak server ada di `PRIVY_AUTH_HANDOFF.md`.

Backend masih harus memverifikasi token Privy, memperoleh DID serta wallet dari sumber tepercaya, dan menegakkan kepemilikan room/run/voucher. Jalur utama ini menggantikan SIWE extension pada spesifikasi awal. Adapter dan test SIWE lama tetap tersedia sebagai kode kompatibilitas, tetapi tidak dipakai UI login saat ini. Tidak ada perubahan backend atau shared sim dalam tahap ini.

## Verifikasi dari repo Momonad

| Pemeriksaan | Hasil dan batasnya |
|---|---|
| Typecheck seluruh workspace | PASS: config, sim, backend, frontend |
| Unit frontend | 20 PASS: runner 4, sesi Privy 5, adapter API 3, sesi legacy 8 |
| Build produksi | PASS, selesai dalam 1 menit 38 detik; warning dependency PURE dan chunk besar tetap ada |
| Browser Edge/WebGL | 10 kelompok PASS; console error 0 dan warning 0; tujuh GLB asli termuat |
| Golden replay browser | 3 fixture resmi PASS |
| Interaksi browser | Countdown, pindah lajur kanan, tekan/lepas rem, deep link dan layout desktop/HP PASS |
| Sampel frame browser | 60 FPS selama sekitar 1,5 detik pada browser headless; bukan bukti performa satu run penuh atau laptop demo |
| Test workspace | Masih FAIL pada satu guard sim bawaan karena komentar CRLF; 36 test sim lain PASS. Source shared tidak diubah. Root test berhenti pada paket sim, sehingga ini bukan klaim seluruh suite PASS |
| Google OAuth + embedded wallet nyata | Belum diuji: App ID/dashboard belum tersedia |
| Otorisasi backend lintas akun / transaksi / WS | Belum diuji dan belum diimplementasikan pada tahap FE lokal ini |

Guard sim menunjuk `packages/sim/src/sim.ts:2`, komentar yang menyebut `Math.random/Date.now`. Regex penghapus komentar gagal pada akhiran CRLF. Perilaku ini sudah tercatat di T02; replay fixture tetap lulus. Perbaikan guard berada pada area bersama milik Dharu.

Dependency Privy/ox mengeluarkan peringatan anotasi PURE dan ukuran chunk; login provider di-lazy-load, tetapi optimasi ukuran tetap pekerjaan T10. Chunk provider Privy sekitar 1,55 MB sebelum gzip dan chunk Three sekitar 1,2 MB. Install juga melaporkan peer dependency wallet lama serta versi viem internal SDK; tidak dilakukan override paksa terhadap dependency internal Privy.

## Berikutnya

1. Pengguna membuat aplikasi Privy dan memberikan App ID publik; aktifkan Google, embedded Ethereum wallet dan origin lokal yang dipakai. Preview sesi ini memakai `http://127.0.0.1:5174`.
2. Dharu menyesuaikan verifikasi sesi backend dengan handoff Privy. Login Google saja belum memberikan izin atas resource game.
3. T04: sambungkan create run dan WS ke runner yang sudah ada, termasuk jam server, input/seq, watermark, snapshot, gangguan dan hasil. Integrasi nyata membutuhkan endpoint serta kontrak sesi backend yang siap.
4. Setelah T04, selesaikan warning bersuara/feed on-chain dan pembuktian online. Pengukuran laptop demo serta pemolesan aset tetap pada T10. Anggaran 50 jam adalah estimasi, bukan timesheet aktual.
