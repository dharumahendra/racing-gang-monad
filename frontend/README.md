# Racing Gang frontend — integrasi backend lokal + Privy

React + Vite + TypeScript, React Three Fiber/three.js, Privy Google login dan embedded wallet. Aturan game memakai packages/sim yang sama dengan backend, angka memakai packages/config.

## Jalankan

Dari root repo:

```powershell
pnpm install
pnpm --filter @racing-gang/frontend dev
```

Buka http://127.0.0.1:5173 (atau port yang ditulis Vite). Node >=22.12; package manager mengikuti root proyek. Hosting SPA nantinya memerlukan fallback rute ke index.html. Belum ada deployment.

## Yang bisa dicoba

- Garasi: lima model asli Quaternius, statistik dari config bersama, saldo contoh berlabel.
- /play: latihan lokal tanpa login, countdown 3 detik, 4 lajur, kamera belakang, traffic, NPC, collision dan mepet dari sim bersama. Kiri/kanan atau A/D, tahan bawah/S untuk rem. Tab background tidak menghentikan waktu sim; runner mengejar tick saat frame kembali.
- Latihan tidak memanggil POST /runs, tidak menambah saldo resmi, tidak membuka kelulusan dan tidak membuat transaksi.
- /watch dan /watch/:code: panel publik tanpa login; adapter WS tersedia, pratinjau jujur saat layanan belum dikonfigurasi.
- /room: adapter create/read room, kode/tautan penonton dan mulai run dalam room; aktif setelah layanan/Privy siap. /run/:id membaca ringkasan hasil publik.
- /dev/golden: development-only, replay tiga fixture resmi sim dan bandingkan seluruh events/hash. Tidak ada rute audit publik yang diklaim selesai.

Source backend Privy, run/room/WS dan summary sudah disinkronkan. Integrasi FE dengan backend asli lokal sudah diuji melalui HTTP/WS; layanan Privy eksternal dan blockchain memakai fixture terisolasi pada tes tersebut. Google OAuth dan transaksi testnet nyata masih memerlukan konfigurasi serta acceptance terpisah.

## Login Google / Privy

Salin .env.example ke .env.local bila diperlukan. Isi VITE_PRIVY_APP_ID (publik), opsional VITE_PRIVY_CLIENT_ID, dan VITE_API_URL jika backend game siap. Google dan embedded Ethereum wallet harus diaktifkan di dashboard Privy dan origin dev harus diizinkan. Restart Vite setelah mengubah env.

Tanpa App ID, SDK tidak diinisialisasi dan tombol login dinonaktifkan; latihan tetap dapat dimainkan. Dengan App ID, login memakai modal Google Privy dan embedded Ethereum wallet otomatis bagi pengguna tanpa wallet. Extension tidak dibutuhkan untuk jalur ini.

Google authenticated belum berarti profil game sudah terverifikasi. GET /me memakai Bearer access token dari Privy dan backend wajib memverifikasinya serta menentukan wallet pemilik dari data server. SIWE tidak dipakai jalur UI utama. Adapter SIWE T02 masih ada sebagai kode kompatibilitas lama dan test regresi, bukan bukti flow Privy live.

Session game tidak menyimpan token Privy di localStorage. Token diambil segar dari SDK saat refresh profil. Subject/wallet change dan logout membersihkan profil; respons lama tidak boleh mengisi ulang akun.

Lihat .context/PRIVY_AUTH_HANDOFF.md untuk konfigurasi dashboard, kebutuhan verifier backend, mapping wallet dan acceptance lintas akun. Jangan menaruh App Secret, Google Client Secret atau private key dalam VITE_*.

## Aset dan visual

Model Quaternius sudah dipakai nyata di garasi dan traffic. Lima model player dipetakan ke lima tier sebagai tampilan; semua statistik tetap config. GLB, License.txt asli dan manifest SHA256 ada di public/assets/quaternius. Lihat LICENSES.md untuk sumber dan transformasi.

PineTree_1 dan Rock_1 dari Ultimate Nature serta Streetlight_Single dari Modular Streets sudah digunakan. GLB, manifest sumber/hash dan lisensi asli ada di public/assets/quaternius-scenery. Jalan empat lajur, marka, curb, truk dan SPIKES tetap procedural. Kamera belakang wajib dan tersedia; kabin opsional belum dibuat. Design system memakai bodywork biru, sky blue, hijau muted dan cream road-paint yang mengikuti aset low-poly.

## Verifikasi

```powershell
pnpm --filter @racing-gang/frontend typecheck
pnpm --filter @racing-gang/frontend test
pnpm --filter @racing-gang/frontend build
# Server dev berjalan terpisah; APP_URL dapat diganti bila port berbeda:
pnpm --filter @racing-gang/frontend test:browser
```

Browser script memakai Edge Windows headless; BROWSER_EXECUTABLE dan APP_URL dapat diubah. Output screenshot/laporan ada di frontend/test-results, di-ignore Git. Script memeriksa GLB asli, semua model, golden replay, countdown, lajur, rem, navigasi publik dan layout HP. Sampel FPS headless bukan jaminan performa seluruh 100 detik pada laptop demo.

Unit menguji runner deterministik dan session isolation. App ID publik sudah dikonfigurasi dan SDK nyata berhasil memuat konfigurasi app. Google OAuth/provisioning wallet belum diuji dengan akun nyata. Tes integrasi backend menggunakan verifier JWT ES256 dan SQLite asli untuk penolakan token/audience serta akses lintas akun. Guard determinisme sekarang membedakan komentar/kode pada LF dan CRLF; aturan sim tidak diubah.

## Persiapan T04: run online

`/online` menampilkan kesiapan layanan dan tidak membuat run saat mode masih mock atau konfigurasi/login belum lengkap. Aktifkan `VITE_DATA_MODE=live` hanya untuk layanan yang sudah siap. Halaman menggunakan profil `/me`, pilihan mobil yang dimiliki, satu `POST /runs` dengan token segar, lalu `/ws/play?token=...`. `VITE_WS_URL` berisi origin WS(S), misalnya `ws://127.0.0.1:3000`, tanpa `/ws/play`; `VITE_API_URL` adalah base HTTP(S). App ID publik tersedia dalam .env.example; jalankan backend secara terpisah dengan env yang valid sebelum mencoba UI online.

REST memakai shared `CreateRunRequest/Response`, memeriksa configVersion serta seed, dan tidak mengulang POST otomatis. Jika hasil pembuatan ambigu, tombol tidak menawarkan pembuatan ulang. Pemeriksaan run aktif setelah respons hilang masih membutuhkan kontrak recovery backend.

PlayClient menyinkronkan jam lewat ping/pong sebelum ready. Seed otoritatif pada run.go diadopsi sebelum countdown tanpa mengganti objek runner; reconnect tidak mereset sim. Watermark tick terakhir selalu dikirim sebelum run.end, termasuk melalui buffer saat offline. Countdown mengikuti startAt server, input dikirim segera untuk tick+1, lalu watermark dan snapshot setiap 100 ms. Gangguan SPEC masuk pada warnTick hanya bila diterima sebelumnya; duplikat ID tidak diterapkan dua kali. Kegagalan pencatatan chain tidak menghentikan game. Hasil lokal, verified, recorded dan run.result tetap terpisah.

Sambung ulang manual mengambil token baru dan mengirim buffer FIFO sebelum watermark baru. Buffer hanya di memori dan dibatasi grace period bersama 30 detik. Integrasi lokal dengan server asli sudah menguji outage tiga detik dan replay hasil terminal setelah koneksi hilang. Ini belum acceptance layanan terpasang atau Google nyata. Reload, cross-tab, pre-start resume dan resync hasil perlu acceptance T09 bersama backend; tidak ada pembuatan run baru otomatis.

`/dev/network` hanya development, memakai adapter yang sama dan endpoint fixture khusus. Halaman ini tidak membuat server palsu otomatis. Test memasang REST/WS simulasi lewat Playwright dan tidak memverifikasi Privy/otorisasi backend. Jalankan setelah Vite aktif:

```powershell
pnpm --filter @racing-gang/frontend test:network
```

Laporan di `test-results/network-report.json` beserta screenshot. Fixture token hanya nilai publik pengujian, tidak diterima sebagai kredensial produksi. Route/module fixture dihilangkan dari build produksi. Lihat `.context/T04_IMPLEMENTATION.md` untuk gap layanan dan handoff.

## T05: HUD, peringatan dan feed

Latihan serta panel online memakai HUD yang sama: waktu, kecepatan, mepet/koin lokal, target tier yang sesuai mobil, status rem/nitro/rantai dan indikator empat lajur. Target tercapai lokal bukan qualification resmi. Semua warning yang sedang berlangsung ditampilkan bersama dengan ikon, nama, lajur dan countdown berdasarkan tick sim; lane cue berkedip 1 Hz, sementara reduced motion mempertahankan cue statis.

Klik Mulai latihan/Hubungkan run untuk membuka audio. Bunyi aba-aba berupa dua nada pendek per detik countdown; tiap jenis gangguan memiliki frekuensi berbeda. Tombol suara dapat mematikan/mengaktifkannya dan menyimpan preferensi lokal. Tidak ada mikrofon, file audio eksternal, musik atau suara mesin. Muting, tab tersembunyi, akhir run dan navigasi menghentikan suara; Audio API yang tidak tersedia tidak memblokir permainan.

Efek +100/+200 memakai event NEAR_MISS asli dari shared sim, termasuk bila beberapa tick dilewati antara frame. Event hanya dibaca renderer/HUD; fisika, log dan hash tidak diubah.

Feed online menggabungkan `nearMiss.verified` dan `nearMiss.recorded` menurut index sehingga receipt yang datang lebih awal atau duplikat tidak membuat row ganda. Blok/latensi/tautan tx hanya muncul dari receipt server; jumlah koin menunggu event verified. Feed tidak mengkredit saldo secara lokal. Backend dan indexer nyata masih diperlukan untuk acceptance FE-5 live.

```powershell
# Vite berjalan pada APP_URL yang dipakai:
pnpm --filter @racing-gang/frontend test:hud
```

`hud-check.mjs` menguji native Web Audio di Edge headless dengan transport server simulasi: gesture, oscillator/gain scheduling, mute, unsupported API, tiga warning, overlap, reduced motion, near-miss lokal, feed dan mobile. Ini bukti runtime audio API, bukan bukti volume terdengar pada speaker laptop demo. Lakukan playtest audio/performa pada perangkat demo sebelum presentasi. Hasil ada di `test-results/hud-report.json`.

## T07/T08: host room dan penonton publik

`POST /rooms` memakai token Privy segar tanpa identitas host dari klien; `GET /rooms/:code` publik. Host memantau setiap 3 detik tanpa membuka socket penonton, menyalin tautan dan masuk ke `/online?room=CODE`. POST run menyertakan roomCode. Backend wajib memverifikasi token, kepemilikan room/run dan satu run aktif. Gate UI bukan enforcement akses.

Panel `/watch/:code?nick=...` memakai `/ws/watch?room=...&nick=...`, tanpa token atau wallet. Energi hanya berubah dari pesan server, termasuk angka pecahan. Pilihan lajur 1–4 dipetakan ke 0–3, durasi Red Zone 3/5/7 detik mengikuti config. Satu gangguan menunggu respons pada satu waktu; accepted tidak ditampilkan sebagai pasti diterapkan. Tidak ada pengulangan create/disrupt otomatis ketika hasil tidak diketahui.

Reconnect mengambil state baru dan tidak mengulang kiriman. Pergantian run memerlukan sambung ulang karena pesan snapshot/result tidak memuat runId. Room kedaluwarsa mematikan gangguan baru, tetapi koneksi run aktif tetap membaca snapshot/hasil. Feed mencantumkan scheduled, receipt dan hasil server dengan status terpisah dari saldo. Host/public watch hanya memakai DTO yang dibatasi server.

`/dev/rooms` khusus development menggunakan komponen yang sama dan endpoint fixture; jalankan test dengan Vite aktif:

```powershell
pnpm --filter @racing-gang/frontend test:rooms
```

Test memasang REST/WS simulasi dengan dua konteks penonton. Ini bukan bukti room live, kapasitas 50 penonton, otorisasi lintas akun, Privy atau chain. Route/module/token fixture tidak termasuk build produksi. T07/T08 sudah melewati integrasi lokal backend asli. T06 memiliki adapter voucher tervalidasi; UI transaksi/pembelian masih menunggu ABI/deployment/relayer/signer nyata. Lihat `.context/T07_T08_IMPLEMENTATION.md`.

## T09: hasil dan pemulihan status

`/run/:id` membaca GET /runs/:id yang publik menurut protokol. Status lifecycle, verifikasi gameplay dan pencatatan chain ditampilkan terpisah. Daftar mepet memiliki status tx/blok/tautan HTTPS; jumlah koin entri tidak dianggap saldo dan tidak memberikan qualification. Polling 3 detik berhenti saat ringkasan akhir diterima atau setelah 90 detik; tombol Perbarui status tetap tersedia, dengan data lama diberi label ketika pembaruan gagal.

POST run yang berhasil menambahkan `?run=ID` ke URL online sambil mempertahankan room. Setelah reload, halaman hanya menawarkan status run; tidak membuka kembali kontrol, memutar ulang input atau membuat POST baru. Tidak ada token/input buffer di storage. Run yang selesai lokal tetapi kehilangan hasil WS juga membaca summary REST. ID publik di URL tidak membuktikan kepemilikan untuk aksi terlindungi.

Reconnect di halaman yang sama menggunakan buffer FIFO T04. Deadline offline 30 detik diperiksa sebelum mengambil token, setelah token selesai dan saat socket dibuka. Kegagalan reconnect sebelum open mempertahankan outage pertama, tidak memulai grace baru. Lewat deadline, buffer dihentikan dan status run perlu diperiksa.

`pnpm --filter @racing-gang/frontend test:results` menguji status/receipt/reload/resync melalui REST/WS simulasi dan `/dev/results`. `test:network` sekarang mempertahankan putus koneksi selama lima detik untuk memeriksa sim terus maju dan queue mendahului watermark. Fixture development tidak menjadi backend live. Full reload/cross-tab gameplay resume serta penemuan run aktif setelah POST yang hasilnya ambigu masih membutuhkan kontrak recovery backend. Lihat `.context/T09_IMPLEMENTATION.md`.

## T10: scene ramai dan instancing

Traffic dibake menjadi vertex color pada salinan geometri, lalu dirender dengan empat pool instance. Pohon, batu dan lampu memakai tiga pool. Marka jalan memakai matriks tetap dan satu offset tiap frame. Bounds visual hanya membuang objek yang sepenuhnya di belakang kamera atau melewati jarak pandang; aturan sim, log, hitbox dan hasil golden tetap dari paket bersama.

`/dev/performance` hanya development: 48 kendaraan sintetis, HUD/warning dan scene renderer yang sama, tanpa input, POST, WS atau hasil gameplay. Rute, probe dan fixture dihapus dari build produksi. Jalankan Vite terpisah, lalu:

```powershell
$env:APP_URL='http://127.0.0.1:5173'
$env:PERF_LABEL='demo'; $env:PERF_SECONDS='100'
pnpm --filter @racing-gang/frontend test:performance
# Opsional PERF_DPR=2 atau PERF_MOBILE=1 (viewport 390x844).
# PERF_BASELINE menunjuk JSON pengukuran sebelum optimasi untuk budget draw call <=50%.
```

Script mencatat GPU aktual, dimensi canvas, frame time, draw calls, triangle, geometry, jumlah instance dan console. Hasil JSON/screenshot di test-results; `BROWSER_REPORT_DIR` dapat diganti. Flag fallback SwiftShader tidak membuktikan GPU software; baca field GPU laporan. Skenario ini mengukur renderer sintetis, bukan acceptance gameplay/performa/audio manual di perangkat demo. Spike frame tetap perlu diperhatikan. Konversi scenery memerlukan source-index.json berupa array `{ "title": "PineTree_1.obj", "url": "URL Drive asli" }` untuk keenam file OBJ/MTL, selain dua file lisensi asli. Manifest output menyimpan provenance tanpa URL unduhan sementara.


## Sinkronisasi backend — 22 Oktober 2026

Branch FE menggabungkan main e91a03f melalui dharu/monad-checks 98b8993. Jalur lokal seed local/event, room/penonton, gangguan, reconnect, summary dan voucher sudah diuji terhadap server yang benar-benar mendengarkan HTTP/WS. Tidak ada bypass auth produksi: JWT ES256 baru ditandatangani dengan key test sementara; hanya lookup user Privy eksternal dan chain diganti fixture. Run milik host lain ditolak tanpa mutasi. Watch/summary tetap publik.

Untuk mencoba login asli, isi backend/.env dari backend/.env.example: App ID yang sama, verification key publik, App Secret BARU yang sudah dirotasi, JWT_SECRET acak, PUBLIC_ORIGIN/CORS sesuai origin FE. Jangan gunakan secret yang pernah dibagikan dalam chat. Jalankan `pnpm --filter @racing-gang/backend dev` (default port 8080), lalu atur frontend/.env.local:

```dotenv
VITE_DATA_MODE=live
VITE_API_URL=http://127.0.0.1:8080
VITE_WS_URL=ws://127.0.0.1:8080
```

Restart Vite. VITE_DATA_MODE=live berarti membaca backend; backend CHAIN_MODE=mock tetap blockchain simulasi. Label /health menyatakan mock/live/unknown; receipt simulasi tidak menjadi bukti testnet. CHAIN_MODE=live masih ditahan implementasi relayer/indexer/signer tim.

Adapter voucher hanya meminta reservasi tier menggunakan token baru dan memvalidasi buyer/cost/nonce/expiry/signature. Tidak ada auto-retry pada hasil POST ambigu, kredit saldo lokal, atau transaksi wallet. Audit UI publik dan pembelian belum diimplementasikan.

```powershell
pnpm -r --workspace-concurrency=1 test
pnpm -r --workspace-concurrency=1 typecheck
pnpm --filter @racing-gang/frontend build
# Hanya integrasi FE dengan backend; tidak perlu kredensial asli:
pnpm --filter @racing-gang/backend test -- test/frontend.integration.test.mjs
```

Regresi browser: test:browser, test:network, test:hud, test:rooms dan test:results memakai Vite development dengan App ID kosong, data mode mock, API/WS kosong. test:service memakai Vite terpisah dengan App ID kosong, data mode live, API berisi origin fixture (GET /health dicegat oleh Playwright); tidak memakai backend atau login. Seluruh server tes hanya lokal. Detail bukti dan batasan terbaru ada di .context/SYNC_IMPLEMENTATION.md.
