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
| NormalCar1.obj + .mtl | NormalCar1.glb | Starter dan pemain latihan |
| NormalCar2.obj + .mtl | NormalCar2.glb | Tier 1 dan variasi traffic |
| SUV.obj + .mtl | SUV.glb | Tier 2 |
| SportsCar.obj + .mtl | SportsCar.glb | Tier 3 |
| SportsCar2.obj + .mtl | SportsCar2.glb | Tier 4 |
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
