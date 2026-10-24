# T04 — persiapan frontend run online

22 Oktober 2026 WIB. Lokasi source: `C:\Belajar\Sem5\Momonad\frontend`. Branch tetap `raka/foundation`; tidak ada commit/push, merge, deployment, transaksi atau pesan kepada tim.

## Yang sudah dikerjakan

- Adapter `POST /runs` memakai shared request/response dan token Privy segar. Body hanya carTier serta roomCode opsional; identitas pemain tidak dikirim sebagai bukti kepemilikan. FE memeriksa seed/runId bytes32 dan configVersion sebelum membuat sim.
- Tidak ada retry POST otomatis. Gangguan jaringan, HTTP 5xx dan respons sukses yang tidak bisa dipakai diperlakukan sebagai hasil yang belum jelas. UI mencegah pembuatan ulang saat hasil ambigu; penemuan kembali run aktif masih membutuhkan endpoint/kontrak recovery.
- PlayClient memakai protokol `/ws/play`: ping/pong, perkiraan offset jam, run.ready dan startAt server. Jam memakai performance time origin + monotonic now. Tick 1 terjadi satu langkah sesudah startAt; renderer tetap menginterpolasi shared sim 30 Hz.
- Input langsung dikirim untuk tick+1 dengan seq. Watermark dan snapshot dikirim setiap 100 ms, setelah input yang dicakup. Pemain tetap memakai statistik shared config dan model Quaternius sesuai tier.
- Gangguan penonton dijadwalkan sebagai SPEC pada warnTick. ACK true hanya bila pesan diterima sebelum warnTick; ACK false bila terlambat. SPEC tidak diterapkan dua kali. Gangguan yang diputar ulang setelah reconnect menerima ulang keputusan ACK asli, bukan keputusan baru berdasarkan tick yang sudah lewat.
- Sambung ulang manual mengambil token baru, mengirim buffer FIFO terlebih dahulu lalu watermark/snapshot terbaru. Sebelum run.go, ready diulang untuk meminta startAt yang sama sesuai kontrak idempoten backend. Tidak membuat run baru otomatis.
- Buffer hanya di memori, dibatasi jumlah pesan dan grace period 30 detik dari config. Ini fondasi T09, belum bukti recovery end-to-end, reload atau cross-tab.
- Hasil lokal, nearMiss.verified, nearMiss.recorded dan run.result dipisahkan. Kegagalan pencatatan chain memberi pesan tanpa menghentikan game. Hasil terminal pertama tidak ditimpa pesan duplikat; receipt chain yang terlambat tetap dapat masuk.
- RunLaunch mengunci submit ganda, membatalkan request pada invalidasi sesi, membuang hasil token/POST lama, dan menutup client saat sesi berubah atau halaman ditinggalkan.
- `/online` memakai gate mode live, konfigurasi HTTP/WS/Privy, login dan profil game. Dalam konfigurasi kosong saat ini halaman hanya menawarkan latihan; tidak mengirim POST.
- `/dev/network` dan fixture token hanya untuk development. Browser test memasang simulasi REST/WS pada endpoint khusus menggunakan Playwright. Route dan modul fixture harus hilang dari build produksi; hasil test bukan hasil multiplayer nyata.

## Temuan backend dan batas integrasi

Fetch menemukan `origin/dharu/server` commit `bbc7e3c`. Branch tersebut memiliki Fastify, SQLite/Drizzle, health/config/me dan SIWE/JWT, tetapi belum mendaftarkan route run atau play WebSocket. Guard yang dibaca masih memverifikasi JWT game dengan sub wallet, bukan token Privy. Branch ini dibaca untuk koordinasi kontrak dan tidak digabungkan diam-diam.

Karena itu **T04 integrasi live belum DONE**. Source FE dan pengujian kontraknya tersedia; online nyata menunggu implementasi Dharu dan konfigurasi Privy pengguna. Shared `packages/config`, `packages/sim`, backend dan kontrak tidak diubah.

## Aturan akses dan handoff Dharu

| Actor/action | Syarat server yang wajib ditegakkan |
|---|---|
| Pengguna membuat run | Token Privy valid; DID dan wallet ditentukan server; mobil serta room miliknya; batas run diperiksa |
| Socket pemain | Terikat pada identitas terverifikasi dan run aktif miliknya; ganti ID atau wallet dari client tidak memberi akses |
| Input/ACK/result claim | Validasi tick, seq, watermark, grace period, urutan dan duplikat; hasil server tetap berwenang |
| Penonton membaca room publik | Tetap tanpa login, dengan DTO publik terbatas; bukan akses profil/run pribadi |

FE gate, unit test dan browser mock tidak membuktikan aturan server ini. Test layanan nyata harus mencoba pengguna A/B, token invalid/expired/wrong audience, mobil/room bukan milik sendiri, socket akun lain, duplicate input/ACK, dan rejected writes tanpa perubahan saldo/run.

Kebutuhan berikutnya:

1. Pengguna membuat app Privy, mengaktifkan Google + embedded Ethereum wallet, mendaftarkan origin dan memberikan App ID publik. Ikuti `PRIVY_AUTH_HANDOFF.md`.
2. Dharu menambahkan verifikasi Privy serta mapping DID/wallet sebelum mengaktifkan route terlindungi. Token pada query WS harus disensor dari log; jangan membagikan URL socket lengkap.
3. Sediakan `POST /runs`, `/ws/play` dan endpoint status/log sesuai protocol. Replay gangguan yang belum di-ACK; `run.ready` idempoten untuk run yang sama dan mengembalikan startAt lama. Socket reconnect harus menempel ke run yang sama, bukan membuat run baru.
4. Konfirmasi dedup seq/ACK serta perlakuan pesan yang mungkin sudah diterima sebelum koneksi putus. Urutan buffer FE saja tidak membuktikan exactly-once di server.
5. Sepakati cara mencari run aktif setelah respons POST hilang. Belum ada API aktif/recovery yang bisa dipakai FE tanpa mengetahui runId/seed; jangan melakukan POST ulang otomatis.
6. Setelah layanan siap, isi mode live, base HTTP, origin WS dan App ID; uji countdown, input/hash, gangguan dan hasil FE vs backend nyata. T05 feed/audio dan T09 recovery lengkap tetap pekerjaan lanjutan.

## Menjalankan

Preview lokal sesi ini: `http://127.0.0.1:5174/online`; latihan tetap `/play`.

```dotenv
VITE_DATA_MODE=live
VITE_API_URL=http://127.0.0.1:3000
VITE_WS_URL=ws://127.0.0.1:3000
VITE_PRIVY_APP_ID=<app-id-publik>
VITE_PRIVY_CLIENT_ID=
```

Nilai ini contoh konfigurasi, bukan server yang sudah tersedia. WS URL adalah origin; adapter menambahkan `/ws/play`. Restart Vite setelah mengubah env. Jangan menaruh secret di VITE_*.

```powershell
pnpm --filter @racing-gang/frontend test
pnpm --filter @racing-gang/frontend build
# Vite aktif pada APP_URL yang dipilih:
pnpm --filter @racing-gang/frontend test:network
pnpm --filter @racing-gang/frontend test:browser
```

Fixture browser menggunakan [Playwright WebSocketRoute](https://playwright.dev/docs/api/class-websocketroute) untuk meniru server pada batas jaringan browser. Ini memeriksa adapter dan perjalanan UI, bukan otorisasi backend atau validasi Privy.

## Bukti dan review

- Verifikasi akhir dilakukan langsung dari repo Momonad: **41 unit FE PASS**, terdiri atas 21 test T04 baru dan 20 test T03/legacy. Test baru diamati RED sebelum implementasi/perbaikan, lalu GREEN.
- Typecheck frontend PASS melalui build; **build produksi PASS dalam 1 menit 10 detik**. Pemeriksaan bundle memastikan token, endpoint dan modul fixture development tidak ikut dibundel. Warning anotasi PURE dan chunk besar masih ada.
- **Browser regresi 10 kelompok PASS**, termasuk 3 golden fixture, tujuh model Quaternius, keyboard dan layout HP. Console error 0 dan warning 0. Sampel frame pendek 60 FPS, bukan acceptance performa laptop demo.
- **Browser kontrak jaringan 10 kelompok PASS**, termasuk offset server +7 detik, satu POST, dua socket selama reconnect, FIFO, replay ACK, gangguan terlambat, kegagalan chain, hasil terminal dan penutupan saat navigasi. Console error/warning 0. Laporan `T04-network-report.json` menyatakan server dimock; tidak ada klaim backend/Privy live.
- Empat temuan penting review independen diperbaiki: ACK replay, ready sebelum go, request sesi lama dan mutasi hasil terminal. Regresi untuk semuanya diamati gagal sebelum perbaikan lalu lulus.

Minor yang ditunda:

- Fingerprint gangguan duplikat masih memakai urutan properti JSON; payload identik dengan properti disusun ulang dapat dianggap konflik. Perlu canonical comparison untuk toleransi replay lebih luas.
- Halaman detail `/run/:id` masih placeholder yang diberi label; memerlukan pembacaan hasil/status backend.
- Socket yang terus berada pada CONNECTING belum memiliki timeout terpisah. Handshake yang sudah open memiliki timeout, dan offline grace membatasi run yang sudah putus; koneksi awal dapat menunggu timeout native browser.

Keputusan pelaksanaan:

- Basis tim dipertahankan; branch server hanya dibaca, shared source tidak diubah. Bila kontrak berubah, adapter perlu disesuaikan dan diuji ulang.
- Pengujian memakai server simulasi khusus dan POST tidak diulang otomatis. Biayanya adalah pemulihan outcome ambigu masih menunggu API aktif/recovery.
- Enforcement kepemilikan, Privy server, WS nyata, konfirmasi chain dan deployment tetap bergantung backend/layanan. Mengabaikan gap ini dapat membuat online tidak tersedia atau tidak aman; fitur live belum dinyatakan selesai.

Peringatan bundle Three/Privy dari T03 dan kegagalan guard CRLF sim tetap diketahui. Tidak ada klaim seluruh workspace hijau atau uji performa satu run penuh di laptop demo.
