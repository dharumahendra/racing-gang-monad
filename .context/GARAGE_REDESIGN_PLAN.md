# Garage — Showcase first

Implementasi brief pengguna 22 Oktober 2026. Base: `raka/foundation` 550a310; remote sudah diperiksa, tidak ada commit baru di branch itu. Branch kerja `codex/garage-showcase`.

## Diagnosis dan keputusan

| Before | After | Why |
| --- | --- | --- |
| Roster 5 kartu, bingkai console, preview, dan panel performa sama kuat | Showroom lebar dengan satu identitas kendaraan; roster ringkas di samping | Mobil 3D menjadi fokus |
| Nama/kelas ditampilkan tiga kali | Identitas utama satu kali; nama tetap tersedia pada pilihan kendaraan | Mengurangi pemindaian berulang |
| Aksi latihan di header dan footer | Satu aksi Mulai balapan dengan keterangan Starter/latihan lokal | Handler `/play` tetap jujur: latihan selalu Starter |
| Tombol putar saja | Orbit drag/pinch, zoom, reset dan fit model pada resize | Memperbaiki interaksi objek sebenarnya |
| Banyak garis, badge, metrik mikro | Statistik numerik dekat scene, detail pembelian dalam disclosure | Informasi lengkap dengan bobot visual berbeda |

## Source of truth / batas lingkup

- `CARS` dari shared config: 5 tier tetap, nama, kecepatan, acceleration/lateral, target mepet, minimum tier, harga koin/MON, supply. Tidak mengubah data/gameplay.
- Aset GLB Quaternius tetap `NormalCar1`, `NormalCar2`, `SUV`, `SportsCar`, `SportsCar2`.
- Saldo mock berlabel contoh; live berasal dari session. Owned/qualified tetap dari session; pratinjau locked tetap bisa dipilih.
- `/play` memakai Starter; pilihan showroom bukan pemilihan mobil untuk balapan. Tampilkan ketentuan ini, jangan meneruskan tier atau mengubah runner.
- `/room`, `/watch`, navigasi, Google/Privy, tema light/dark dipertahankan.
- Pembelian tetap disabled; tuning/livery/cabin tidak diimplementasikan di source, jangan dibuat sebagai fitur palsu.
- Tidak ada fitur protected/backend baru. Tidak mengubah authorization, transaksi atau API.
- Source sudah memakai React Three Fiber. Pertahankan, gunakan OrbitControls bawaan Three.js tanpa dependency baru.

## Sistem visual

Gunakan token Stitch yang ada: blue light/cyan dark sebagai satu accent, `paper`/`canvas` untuk permukaan netral, `muted` untuk label sekunder. Space Grotesk untuk judul dan angka; Plus Jakarta Sans untuk body. Skala ruang 4/8/16/24/40px, radius existing 4/8px. Vehicle title 36–48px desktop, 28–32px mobile. Teks informasi >=12px; angka tabular. Sidebar netral. Vehicle assets memberikan warna arcade sebenarnya.

Motion hanya feedback tekan (CSS transform 120ms, curve cubic-bezier(.23,1,.32,1)), tanpa entry/dekorasi kontinu; focus keyboard instan, hover digate pointer fine, reduced motion tanpa transform. Viewer demand-render tanpa update React per frame, DPR <=1.5, orbit tanpa damping/autoRotate, cleanup listener/controls.

## Pengerjaan dan verifikasi

1. Simpan screenshot baseline desktop/mobile.
2. Pecah Garage menjadi pilihan/identitas/statistik/detail yang kohesif; layout showroom-first. Bersihkan CSS Garage lama, jangan menambah parallel theme.
3. Orbit/zoom/reset, fit bounds model dan resize, safe fallback/lifecycle.
4. Dev-only `?garageData=worst|empty|one|zero` untuk nama panjang, status missing/qualified/owned, saldo besar/nol dan daftar kosong. Fixture berada di boundary view, tidak mengubah config maupun session.
5. Browser: 1440x900, 1280x800, 1024x768, 390x844; tambahan 320 dan 2560; light/dark, reduced motion, teks 200%, pointer/touch; switch semua GLB, drag/zoom/reset, lock states, no overflow, CTA/navigation, practice behavior, console/WebGL.
6. Jalankan typecheck, unit, build dan browser check terkait; final screenshot dan laporan before/after/why beserta batas verifikasi.

Tidak commit/push/deploy pada task ini tanpa permintaan baru.
