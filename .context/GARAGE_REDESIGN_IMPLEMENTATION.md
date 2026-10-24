# Racing Gang — Garage redesign

Implementasi brief 22 Oktober 2026 di branch `codex/garage-showcase`, dari base `550a310` (`raka/foundation`). Status: implementasi dan verifikasi selesai. Self-review, bukan review independen.

## Perubahan utama

| Before | After | Why |
| --- | --- | --- |
| Showroom sempit di antara roster dan panel performa, dengan beberapa bingkai bertingkat | Showcase lebar, latar menyatu dengan halaman, mobil asli diperbesar dan dipandang dari depan tiga perempat | Mobil menjadi fokus visual utama |
| Nama, kelas, dan status mobil berulang di beberapa panel | Satu identitas utama dekat mobil; roster tetap menampilkan nama dan status pilihan | Memperjelas kendaraan yang dipilih |
| Kartu kendaraan penuh label, batas, dan statistik berulang | Baris netral dengan penanda terpilih, nama yang bisa membungkus, dan ikon dimiliki/terkunci | Lebih cepat dipindai, termasuk nama panjang |
| Dua aksi latihan sama kuat | Satu tombol Mulai balapan dekat mobil; room dan penonton menjadi aksi sekunder | Memperjelas langkah berikutnya |
| Semua detail pembelian dan saldo selalu tampil | Kecepatan tetap menonjol; syarat kendaraan dan rincian saldo memakai disclosure native | Informasi lengkap tanpa memenuhi layar |
| Putar/reset saja | Drag orbit, wheel/pinch dan tombol zoom, putar kiri/kanan, reset kamera serta zoom | Interaksi showroom bekerja pada model sebenarnya |
| HP menampilkan roster sebelum mobil | Identitas dan model tampil lebih dahulu; roster menjadi dua kolom di bawahnya | Prioritas visual tetap terjaga pada layar kecil |

Tema Daylight tetap default; Cyber tersedia melalui toggle. Warna dan font menggunakan sistem Stitch yang sudah ada: Space Grotesk, Plus Jakarta Sans, blue/cyan accent dan permukaan netral. Tipografi Garage memakai rem agar mengikuti pembesaran teks. Feedback tekan memakai CSS transform 120ms; tidak ada animasi masuk, floating, atau rotasi otomatis. Keyboard dan reduced motion tidak memakai pergerakan dekoratif.

## Fungsi dan data yang dipertahankan

- Lima tier, nama, kecepatan, target mepet, minimum tier, harga koin dan MON tetap bersumber dari shared `CARS`; tidak mengubah perhitungan game.
- Model tetap Quaternius `NormalCar1`, `NormalCar2`, `SUV`, `SportsCar`, `SportsCar2`.
- Locked tetap bisa dipratinjau; dimiliki dan qualified tetap mengikuti session. Starter gratis/bukan NFT dan status Soulbound tetap dijelaskan pada detail.
- Saldo contoh tetap berlabel contoh; saldo live berasal dari akun. Rincian tersedia/pending/reserved tetap dapat dibuka.
- Latihan tetap menggunakan Starter, termasuk saat showroom sedang menampilkan tier lain. Ketentuan ini ditulis dekat CTA; tidak meneruskan tier palsu ke runner.
- Google/Privy, navigasi, room dan penonton dipertahankan. Tidak mengubah autentikasi, authorization server, API, kontrak atau transaksi.
- Pembelian tetap nonaktif. Tuning Shop, livery, dan kabin tidak ditemukan sebagai fungsi yang sudah diimplementasikan, sehingga tidak ditambahkan sebagai tombol palsu.

## Three.js

Source sebelumnya sudah memakai React Three Fiber; pendekatan itu dipertahankan tanpa dependency baru. `OrbitControls` berasal dari Three.js yang sudah terpasang. Kamera menghitung framing dari bounds model dan aspect ratio, lalu memperbaruinya pada resize. Viewer tetap `frameloop="demand"`, DPR dibatasi 1.5, tanpa auto-rotate/damping dan tanpa update state React pada setiap gerakan pointer. Listener dan controls dibersihkan saat unmount.

Grid dekoratif dihapus, platform tetap ada, lantai disamakan dengan latar halaman, dan pencahayaan tetap sederhana. Error loading menampilkan pesan jujur, menonaktifkan kontrol viewer, dan bisa pulih dengan memilih mobil lain. Aset, engine game, kamera balapan belakang, dan resource GLTF bersama tetap dipertahankan.

## Data ekstrem

Fixture hanya tersedia pada development melalui `/?garageData=demo|worst|empty|one|zero`. Tidak mengubah `CARS`, session, maupun kontrak data produksi. Toggle juga hanya muncul saat parameter tersebut sengaja dibuka.

| Field | Sumber / batas | Evaluasi |
| --- | --- | --- |
| Nama kendaraan | Shared config, 5 kendaraan; bukan input pengguna | Nama panjang, compound tanpa spasi, satu huruf, diakritik, Jepang, emoji |
| Kelas dan tier | Daftar tetap 0–4 | Label membungkus tanpa menggeser ikon |
| Kecepatan | `toKmh(CARS.maxSpeed)` | Unit dan angka tetap berpasangan |
| Mepet / minimum tier / harga | Shared config | Nilai asli; Starter menampilkan syarat yang tidak berlaku sebagai — |
| Owned / qualified | Account opsional; array tier dari session | Anonymous, owned, qualified dan locked |
| Saldo | Number dari account / preview fixture; tidak ada batas presentasi khusus | 1.234.167.890, pending/reserved besar, dan nol; tanpa truncation |
| Koleksi | Produksi tetap 5 | Empty dan one diuji pada boundary view; 1.000 row tidak relevan untuk config tetap ini |
| Model | 5 GLB yang sudah ada | Loading, sukses, simulasi 404, dan pemulihan |

Temuan yang diperbaiki: nama panjang memerlukan `min-width:0` dan wrapping; nama pendek di sebelah baris panjang perlu top alignment; saldo besar perlu header yang dapat membungkus; kontrol sentuh perlu target 44px; header HP perlu menggabungkan tombol login dan keterangannya agar model muncul lebih awal.

## Verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| Unit frontend | 112 lulus, 0 gagal |
| Typecheck | PASS, exit 0 |
| Build produksi | PASS, exit 0; warning dependency/chunk dicatat |
| Garage browser — Chromium | 9 kelompok pemeriksaan lulus; 12 kombinasi viewport/tema; 0 error aplikasi, 4 warning driver ReadPixels |
| Latihan desktop — Edge | 4 pemeriksaan lulus: start/countdown, pindah lajur, rem, lepas rem |
| Regresi desain — Edge | 9 kelompok pemeriksaan lulus, termasuk tema lintas halaman/tab, public spectator dan storage diblokir |
| Bundle produksi | Fixture/toggle development tidak ikut bundle; copy Garage final ditemukan |
| Preview dengan konfigurasi Privy asli | SDK siap, tombol Google aktif, dan model 3D tampil; OAuth tidak dijalankan |

Bukti JSON, screenshot, dan log ada pada artifact output chat `GARAGE_REDESIGN_REPORT.md`. Jalankan ulang script di `frontend/scripts/` dengan `APP_URL` menunjuk server lokal.

Target visual: 1440×900, 1280×800, 1024×768, 390×844, ditambah 320 dan 2560, masing-masing light/dark. Evaluasi juga meliputi nama panjang, status kunci, pembesaran teks 200%, reduced motion, pemilihan semua GLB, orbit/zoom/reset, keyboard zoom, idle render, room dan penonton.

Keyboard latihan diperiksa tersendiri pada desktop Edge. Renderer software Chromium sempat membuat run berakhir sebelum pemeriksaan rem dikirim; mekanik game tidak diubah untuk melewati tes. Hasil browser dan keterbatasan renderer dicatat secara terpisah.

Belum menguji perangkat HP fisik, Safari, GPU kelas menengah secara langsung, OAuth Google sampai selesai, pembelian, atau transaksi testnet. Pinch/drag memakai emulasi touch CDP. Tidak mengklaim FPS hardware. Build memiliki warning dependency Privy/ox dan ukuran chunk; warning driver ReadPixels, bila ada, dicatat terpisah dari error aplikasi.

## Berkas penting

- [Garage.tsx](../frontend/src/pages/Garage.tsx): komposisi halaman, roster, identitas, saldo, spesifikasi dan aksi.
- [garage.css](../frontend/src/garage.css): layout, theme roles, tipografi, responsive dan feedback.
- [CarPreview.tsx](../frontend/src/components/CarPreview.tsx): scene, controls, demand rendering dan fallback.
- [VehicleModel.tsx](../frontend/src/components/VehicleModel.tsx): melaporkan bounds model untuk framing.
- [showroom-camera.ts](../frontend/src/lib/showroom-camera.ts): framing kamera; diuji di file `.test.ts` terkait.
- [garage-dev.tsx](../frontend/src/pages/garage-dev.tsx): fixture development.
- [garage-check.mjs](../frontend/scripts/garage-check.mjs) dan [practice-check.mjs](../frontend/scripts/practice-check.mjs): tes browser yang dapat dijalankan ulang.
- `styles.css`: menghapus aturan Garage lama; `main.tsx`: mengimpor stylesheet Garage; `package.json`: menambah script tes, tanpa dependency baru. Tes desain lama disesuaikan dengan nama CTA baru.



Perubahan belum di-commit, push, atau deploy pada task ini.

Preview lokal: http://127.0.0.1:5174/ (konfigurasi `.env.local` yang sudah ada tetap dipakai).
