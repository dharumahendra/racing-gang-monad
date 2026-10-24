# Daftar asset game mobil

Dicatat 21 Oktober 2026. Konsep lompat antar kendaraan dibatalkan. Kamera yang diinginkan: belakang mobil dan dalam kabin, menghadap jalan ke depan. Interior generik boleh dipakai bersama untuk beberapa mobil.

## Pilihan pengguna: mobil
- Quaternius Cars Pack: https://quaternius.com/packs/cars.html
- Preview kedua yang dipilih: https://quaternius.com/assets/images/fullres/cars2.jpg
- Paket 8 model; FBX, OBJ, Blend; CC0 menurut pembuat. Gambar kedua merupakan preview paket, belum menunjukkan satu model individual yang dikunci.

## Kandidat jalan dan landscape
- Quaternius Modular Streets: https://quaternius.com/packs/modularstreets.html
  - 25 model jalan modular; FBX/OBJ/Blend; CC0. Kandidat utama untuk dirakit menjadi rute, bukan map siap main.
  - Preview: https://quaternius.com/assets/images/fullres/modularstreets.jpg
- Quaternius Ultimate Nature: https://quaternius.com/packs/ultimatenature.html
  - 150 model alam; FBX/OBJ/Blend; CC0. Pohon/batuan/dekorasi perlu ditata pada terrain.
  - Preview: https://quaternius.com/assets/images/fullres/ultimatenature.jpg
- Kenney City Kit Roads: https://kenney.nl/assets/city-kit-roads
  - Alternatif: 90 file, CC0, termasuk rambu dan lampu lalu lintas.

## Kandidat interior generik
- Grab3D Car Dashboard: https://grab3d.com/models/vehicles/car-dashboard/
  - Halaman penyedia menyatakan gratis CC0; GLB 1.6 MB; 9.754 triangle; setir berupa node terpisah. Kandidat untuk pandangan depan saja; bukan kabin lengkap.
- Grab3D Modern Car Interior: https://grab3d.com/models/vehicles/modern-car-interior/
  - Halaman menyatakan CC0, kabin cutaway tanpa atap. Versi Light 20.470 triangle, GLB 1.1 MB. Kandidat bila perlu kursi/panel pintu/pilar.
- Bricchi Games Retro Car With Interior: https://bricchi-games.itch.io/retro-car-with-interior
  - Alternatif gratis dengan interior; seluruh mobil 3.092 triangle; Blend/FBX. Pembuat mengizinkan komersial dengan kredit, menyebut Creative Commons/CC 4.0. Cek berkas lisensi untuk identifikasi lengkap sebelum integrasi. Gaya PSX; ada laporan pengguna mengenai relink tekstur.
- Spectral GT RS: https://github.com/JaronKBragg7337/spectral-gt-rs
  - Alternatif repo dengan GLB dan Blender, interior serta setir; README menyatakan CC0. Detail lebih kompleks; bukan prioritas untuk dipadukan dengan Quaternius.

## Status dan rekomendasi
Rekomendasi awal: mobil Quaternius + Modular Streets + Ultimate Nature; uji dashboard generik Grab3D untuk mode kabin. Ini rekomendasi, kandidat selain mobil belum dipilih pengguna.

Kamera A dan C bisa menggunakan lingkungan 3D yang sama. Interior bersama dapat ditampilkan khusus mode kabin; sesuaikan kamera, skala, material, dan cegah bodi luar menutupi pandangan. Speedometer aktif dan gerak setir masih perlu logika game.

Informasi paket/lisensi berasal dari halaman sumber. Arsip model belum diunduh atau diuji impor; kualitas dekat aspal, sambungan jalan, kecocokan gaya, pivot, performa browser, dan kelengkapan lisensi arsip belum diverifikasi.

## Riset aset realistis — 22 Oktober 2026

Target visual: render showroom seperti referensi McLaren (`karoly-molnar-menu3.jpg`): cat clearcoat, pantulan lingkungan, velg detail. Sebagian besar kesan itu datang dari model PBR + HDRI pantulan, bukan model saja. Lisensi dan isi dicek langsung dari repo/API pada tanggal ini; aset diunduh sementara untuk inspeksi lalu dihapus. Belum ada yang dimasukkan ke `frontend/public`.

### Mobil

| Kandidat | Sumber | Lisensi (terverifikasi) | Isi GLB | Penilaian |
|---|---|---|---|---|
| **Khronos Car Concept** | GitHub `KhronosGroup/glTF-Sample-Assets/Models/CarConcept` | CC BY 4.0 — Eric Chadwick / Darmstadt Graphics Group 2024 (tertulis di `asset.copyright` GLB). Turunan model CC0 Unity Fan. Logo Khronos ada di model; perlu dihapus/diganti tekstur. | 11,5 MB, 213 rb tri, 29 material, clearcoat/transmission/iridescence, interior lengkap, material variants | **Paling realistis yang benar-benar di GitHub.** Kandidat mobil tier tertinggi/showroom. Perlu Draco/KTX2 dan atribusi di `LICENSES.md`. |
| **Unity Fan "FREE Concept Car 001–040"** | Sketchfab `unityfan777` (bukan GitHub) | Deskripsi penulis: "public domain (CC0) … no attribution required". Label lisensi Sketchfab menampilkan "Free Standard" — ketidakcocokan dicatat; simpan tangkapan deskripsi saat unduh. | 108 rb–1 jt face per model; unduh butuh login Sketchfab pemilik akun | Paling banyak pilihan realistis gratis (mis. 002, 037 dengan velg detail, 033). Cocok untuk Tier 1–4. Wajib decimate ke ±30–60 rb tri per mobil untuk browser. |
| Spectral GT RS | GitHub `JaronKBragg7337/spectral-gt-rs` | CC0 1.0 (file LICENSE) | 4,6 MB, 152 rb tri, interior + animasi pintu/setir | Lisensi bersih, tapi gaya mainan/kartun — **tidak** sesuai target realistis. |
| three.js `ferrari.glb` | GitHub `mrdoob/three.js/examples/models/gltf` | Kredit "vicent091036" (Sketchfab); halaman Sketchfab sumber sudah tidak ada sehingga lisensi tak bisa diverifikasi; merek Ferrari | 1,6 MB Draco, 359 rb tri | **Ditolak**: lisensi tak terverifikasi + risiko merek dagang. |
| Stunt Rally 3 cars | GitHub `stuntrally/stuntrally3/data/cars` | GPL-3.0 (repo), lisensi per-mobil beragam | OGRE `.mesh` | **Ditolak**: copyleft, format perlu konversi berat. |
| KayKit/Quaternius/Kenney | GitHub `Papyszoo/CC0-Public-Domain-Models`, situs pembuat | CC0 | low-poly | Tetap layak untuk **lalu lintas** (banyak instance, ringan); tidak realistis. |

### Jalan dan lingkungan (Poly Haven — CC0, bukan GitHub, ada API publik `api.polyhaven.com`)

- Tekstur aspal PBR: `asphalt_02`, `asphalt_track`, `road_damaged`, `road_damaged_2`, `clean_asphalt`, `worn_asphalt` (diffuse/normal/roughness, 1k–8k). Pakai 1k–2k + `repeat` sepanjang jalan; marka lajur tetap dari geometri/decal sendiri.
- HDRI pantulan & langit: `derelict_highway_midday` (jalan raya siang), juga `autumn_road`, `dam_road`, `cobblestone_street_night` (malam). Ini yang membuat cat mobil tampak seperti referensi; pakai 1k–2k `.hdr` untuk `scene.environment`.
- Properti tepi jalan: `concrete_road_barrier`, `concrete_road_barrier_02`, `street_lamp_01/02`, `modular_chainlink_fence`, `old_tyre`.
- ambientCG (CC0) sebagai cadangan tekstur aspal.

### Rekomendasi

1. Showroom Garage + tier tertinggi: Khronos Car Concept (GitHub, CC BY 4.0) dengan HDRI Poly Haven.
2. Tier lain: 3–4 Unity Fan concept car (CC0 menurut penulis), diunduh pemilik akun Sketchfab, di-decimate dan dikompresi.
3. Jalan: plane aspal Poly Haven + marka sendiri + barrier beton + HDRI jalan raya.
4. Lalu lintas tetap low-poly CC0 agar 60 fps; sesuaikan material (roughness, warna) agar tidak kontras dengan mobil pemain.

Belum diverifikasi: tampilan di kamera belakang game, performa 60 fps dengan model realistis, dan pivot/skala tiap model. Batas ukuran ideal per mobil pemain = 3 MB setelah kompresi.

### Status integrasi — 22 Oktober 2026 malam

- **Tier 4 = Khronos Car Concept** (`public/assets/carconcept/CarConcept.glb`, 1,7 MB, ≈88 rb segitiga, logo Khronos dihapus). Pipeline: `frontend/scripts/convert-carconcept.mjs` (devDependency pinned: `@gltf-transform/*` 4.5.1, `meshoptimizer` 1.3.0, `sharp` 0.35.5). Loader memakai `MeshoptDecoder`; bounding box showroom dihitung presisi.
- **HDRI** `derelict_highway_midday_1k.hdr` sebagai `scene.environment` di Garage (0,7–0,9) dan run (0,6); **aspal** `asphalt_02` 1k (diffuse/normal/roughness) menggantikan warna polos jalan dan bergulir mengikuti jarak tempuh. Keduanya opsional: gagal muat ? tampilan lama.
- Run: kaca transmission diganti transparansi biasa (`VehicleModel quality="race"`), karena transmission menambah render pass seluruh scene.
- Ukur (Edge headless, Intel Iris Xe, `/dev/performance?tier=N`, 48 kendaraan): Tier 0 p50 16,7 ms / p95 20,8 ms, 185 rb tri, 27 draw call; Tier 4 p50 16,6 ms / p95 24,4 ms, 274 rb tri, 39 draw call. Sebelum join+simplify: p50 31 ms, 247 draw call. Bukan bukti perangkat demo fisik.
- Tier 1–3 dan lalu lintas masih Quaternius. Unity Fan concept car (CC0 menurut penulis) menunggu diunduh pemilik akun Sketchfab, lalu bisa diproses dengan pipeline serupa.
- **Update:** Starter–Tier 3 kini Unity Fan Concept Car 002/001/033/037 (`public/assets/unityfan/`, 0,6–1,0 MB, ±90 rb segitiga), diunduh lewat API Sketchfab dengan token pemilik akun. Semua 5 tier pemain realistis; lalu lintas masih Quaternius. Ukur `/dev/performance?tier=0..3`: p50 16,6–16,7 ms, p95 25,8–27,1 ms, ±274–281 rb tri, 29–31 draw call (Edge headless, Iris Xe).
