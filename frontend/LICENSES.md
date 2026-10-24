# Lisensi aset frontend

## Quaternius Cars Pack

Pembuat: Quaternius. Lisensi: **CC0 1.0 Universal / Public Domain Dedication**.

- Halaman pembuat: https://quaternius.com/packs/cars.html
- Folder sumber yang ditautkan pembuat: https://drive.google.com/drive/folders/1fKlbDry77iY8KlEoxzUxIAZQL_XhzWlA
- File OBJ/MTL: https://drive.google.com/drive/folders/1kMPGKO8D_k3c1f0us9MJr9aiWrzz_72C
- Lisensi asli: https://drive.google.com/file/d/1CqsvhpIzBNSDlZsBWdJcJNC1B-TE3cXK/view
- Definisi lisensi: https://creativecommons.org/publicdomain/zero/1.0/

Berkas License.txt asli disimpan di `public/assets/quaternius/License.txt`. Metadata, ukuran GLB, dan SHA256 OBJ asli ada di manifest.json di folder yang sama. Sumber diperiksa dan diunduh 22 Oktober 2026 WIB menggunakan konektor Google Drive.

| Model sumber | Output browser | Pemetaan saat ini |
|---|---|---|
| NormalCar1.obj + .mtl | NormalCar1.glb | Tidak dipakai lagi (Starter kini Unity Fan 002) |
| NormalCar2.obj + .mtl | NormalCar2.glb | Variasi traffic |
| SUV.obj + .mtl | SUV.glb | Tidak dipakai lagi |
| SportsCar.obj + .mtl | SportsCar.glb | Tidak dipakai lagi |
| SportsCar2.obj + .mtl | SportsCar2.glb | Tidak dipakai lagi (Tier 4 kini Khronos Car Concept) |
| Taxi.obj + .mtl | Taxi.glb | Traffic |
| Cop.obj + .mtl | Cop.glb | Traffic |

Halaman pack menyebut delapan model, tetapi folder OBJ yang terbaca saat integrasi berisi tujuh model di atas. Tidak mengklaim ada model kedelapan yang sudah diimpor. Mapping tier adalah pilihan visual FE sementara; statistik gameplay tetap dari packages/config.

Perubahan terhadap source: konversi OBJ/MTL ke binary GLB, material Phong ke Standard flat shading, orientasi ke depan -Z, pusat model dan ground pivot disesuaikan, skala visual ke 1,8×4,5 m sesuai ukuran player config saat ini. Hitbox dan logika sim tidak diubah.

Konversi dapat diulang dengan `node scripts/convert-assets.mjs <folder-obj-mtl-asli>`. Tidak memakai tekstur eksternal; warna material berasal dari MTL sumber.

## Ultimate Nature dan Modular Streets

Pembuat: Quaternius. Lisensi kedua paket: **CC0 1.0 Universal**. Sumber diperiksa dan diunduh 22 Oktober 2026 WIB.

- Ultimate Nature: https://quaternius.com/packs/ultimatenature.html
- Modular Streets: https://quaternius.com/packs/modularstreets.html
- Folder sumber Nature: https://drive.google.com/drive/folders/1-Kl0L_Jg8awbh0S5T-z3zxh4mVlnxTpa
- Folder sumber Streets: https://drive.google.com/drive/folders/1-YvMpLDYBIy-0Ms7ZlFmUpChTbHku8IJ

| Model sumber OBJ/MTL | Output GLB | Tinggi visual | Pemakaian |
|---|---|---|---|
| PineTree_1 | PineTree_1.glb | 6,5 m | Pohon di sisi jalan |
| Rock_1 | Rock_1.glb | 0,8 m | Batu di sisi jalan |
| Streetlight_Single | Streetlight_Single.glb | 6,5 m | Lampu jalan |

GLB, dua lisensi asli dan manifest berada di `public/assets/quaternius-scenery`. Manifest memuat URL OBJ/MTL asli, SHA256 sumber dan output, serta ukuran berkas. Konversi dapat diulang dengan `node scripts/convert-scenery.mjs <folder-sumber>`; folder itu juga memerlukan `source-index.json` dengan URL sumber asli seperti yang didokumentasikan converter. URL unduhan sementara tidak disimpan dalam repo.

Transformasi: pusat X/Z dan pivot tanah disesuaikan, skala seragam mengikuti tabel, material flat Standard tanpa tekstur. Warna MTL sengaja diterangkan untuk palet daylight scene. Saat runtime, warna dibake ke salinan vertex dan objek sejenis memakai instancing; GLB serta geometri sumber tidak dimutasi. Mobil traffic memakai teknik yang sama. Ini mengubah render, bukan statistik/hitbox/sim.

## Geometri buatan dalam kode

Jalan empat lajur, marka, curb, truk placeholder dan SPIKES dibuat dengan primitive three.js. Road tile Modular Streets tidak dipakai: lebar jalan dan empat lajurnya tetap mengikuti config bersama. Hanya lampu dari paket Streets yang diimpor. Kabin tetap opsional dan belum dibuat.

Ilustrasi mobil CSS T02 sudah diganti dengan model Quaternius. Kabin belum dibuat. Font memakai Bahnschrift/Segoe UI/Consolas dari sistem dengan fallback generik; tidak ada file font pihak ketiga yang didistribusikan.


## Font design system Stitch

Space Grotesk dan Plus Jakarta Sans disimpan sebagai font variable asli di public/fonts. Keduanya memakai SIL Open Font License1.1; OFL asli dan manifest URL sumber Google Fonts ada di folder yang sama. Berkas font tidak dimodifikasi. Font disajikan lokal tanpa permintaan font CDN saat runtime.

## Khronos Car Concept (Tier 4)

Sumber: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept — **CC BY 4.0**.

Atribusi wajib: "Car Concept" © 2024 Darmstadt Graphics Group GmbH, dibuat oleh Eric Chadwick, dilisensikan CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Model ini turunan dari "FREE Concept Car 004 - public domain (CC0)" oleh Unity Fan (unityfan777, Sketchfab).

Lisensi CC BY tidak mencakup logo/merek dagang Khronos dan 3D Commerce. Logo tersebut **dihapus**: tekstur pelat nomor dan dinding ban yang memuatnya diganti warna polos, sehingga tidak ada logo Khronos di build.

Perubahan oleh Racing Gang (dapat diulang dengan `node scripts/convert-carconcept.mjs <CarConcept.glb asli>`): varian material dibuang (hanya cat default Carmine); diputar 180° agar depan menghadap -Z; dipusatkan di X/Z, roda di Y=0; skala seragam ke panjang 4,5 m; node di-flatten dan primitive digabung per material; geometri disederhanakan meshopt (≈214 rb ? ≈88 rb segitiga); tekstur =1024 px WebP; kompresi EXT_meshopt_compression. Saat run, kaca transmission diganti material transparan biasa demi performa. Hitbox dan statistik tetap dari packages/config.

Berkas: `public/assets/carconcept/CarConcept.glb`, `LICENSE.md` asli, dan `manifest.json` (URL sumber, SHA256 sumber/output, ukuran, jumlah segitiga, bounding box).

## Poly Haven — HDRI dan aspal

Lisensi: **CC0 1.0** (https://polyhaven.com/license). Diunduh 22 Oktober 2026 dari CDN resmi Poly Haven; berkas tidak dimodifikasi.

| Berkas | Aset | Kredit (tidak wajib) | Pemakaian |
|---|---|---|---|
| `derelict_highway_midday_1k.hdr` | https://polyhaven.com/a/derelict_highway_midday | Dimitrios Savva, Jarod Guest | Pantulan lingkungan (scene.environment) di Garage dan run |
| `asphalt_02_diff/nor_gl/rough_1k.jpg` | https://polyhaven.com/a/asphalt_02 | Rob Tuytel | Permukaan jalan empat lajur, digulir mengikuti jarak tempuh |

Lokasi: `public/assets/polyhaven/` dengan `manifest.json` (URL, ukuran, SHA256). Bila HDRI/tekstur gagal dimuat, scene tetap tampil memakai warna jalan dan pencahayaan lama.

## Unity Fan "FREE Concept Car" (Starter–Tier 3)

Pembuat: Unity Fan (Sketchfab `unityfan777`, https://sketchfab.com/unityfan777). Deskripsi penulis pada setiap model: *"This is public domain (CC0), I'm as the author give it away to the World. This model and design can be used by anybody for anything. No attribution required."* Label lisensi yang ditampilkan Sketchfab untuk model ini adalah "Free Standard"; kami mengikuti pernyataan CC0 penulis dan menyimpan salinan deskripsi lengkap (diambil lewat API Sketchfab 22 Oktober 2026) di `public/assets/unityfan/UFxxx.license.json`. Diunduh lewat API resmi Sketchfab dengan akun pemilik proyek.

| Tier | Model | Sumber | Output |
|---|---|---|---|
| Starter (dan latihan) | FREE Concept Car 002 | https://sketchfab.com/3d-models/090898c41395478d9dc4dea261944581 | `UF002.glb` |
| Tier 1 | FREE Concept Car 001 | https://sketchfab.com/3d-models/af71d64a89c04f5fb62a06bdd92c045b | `UF001.glb` |
| Tier 2 | FREE Concept Car 033 | https://sketchfab.com/3d-models/58f9d30f8e734de8ba05fa64e0e6584a | `UF033.glb` |
| Tier 3 | FREE Concept Car 037 | https://sketchfab.com/3d-models/646a3a31b0224379b6e767abc34d58dd | `UF037.glb` |

Perubahan (ulangi dengan `node scripts/convert-unityfan.mjs <folder GLB + .license.json>`): depan ke -Z, pusat X/Z, roda di Y=0, skala seragam ke panjang 4,5 m, flatten + join per material, simplify meshopt ke ±90 rb segitiga, tekstur =1024 px WebP, EXT_meshopt_compression. `manifest.json` memuat SHA256 sumber/output, ukuran, segitiga, dan bounding box. Lencana teks "Unity FAN" milik penulis di bodi model 037 dibiarkan.

## Landscape realistis — Poly Haven (24 Oktober 2026)

Semua aset berikut CC0 1.0 Universal, diambil melalui API/CDN resmi Poly Haven. Lisensi: https://polyhaven.com/license dan https://creativecommons.org/publicdomain/zero/1.0/. Salinan keterangan ada di public/assets/landscape/LICENSE.txt. manifest.json menyimpan URL sumber, checksum sumber/output, ukuran, dan jumlah segitiga.

- Rocky Terrain 02: https://polyhaven.com/a/rocky_terrain_02 — diffuse, normal OpenGL dan roughness 1K dikonversi WebP untuk tanah/bukit.
- Rock Moss Set 02: https://polyhaven.com/a/rock_moss_set_02 — model glTF dinormalisasi pivot/skala, disederhanakan menjadi 5.998 segitiga, tekstur maksimal768px WebP dan kompresi meshopt. GLB286.112 byte.
- Tree Small 02: https://polyhaven.com/a/tree_small_02 — model glTF dinormalisasi ke tinggi7m, disederhanakan menjadi12.250 segitiga, tekstur maksimal768px WebP dan kompresi meshopt. GLB894.464 byte.
- Kloofendal 48d Partly Cloudy (Pure Sky): https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky — HDR1K asli, untuk background dan pantulan lingkungan balap. Showroom tetap memakai HDRI Garage.

Reproduksi dari frontend: node scripts/import-landscape.mjs <folder-sumber-sementara>. Script mengambil indeks resmi, memeriksa ukuran/MD5 dari API, lalu menulis hasil dan SHA256. Tidak menyimpan key/credential. Raw glTF/dependensi disimpan di folder sementara yang dipilih, bukan paket aplikasi.

Model Quaternius lama masih ada sebagai aset historis; Roadside balapan sekarang memakai model Poly Haven dengan material PBR asli. Landscape mesh dan pola bukit dibuat dalam kode, tidak mengubah sim, hitbox, atau ekonomi.
