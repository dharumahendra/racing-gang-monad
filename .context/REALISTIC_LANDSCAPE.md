# Landscape realistis — 24 Oktober 2026

## Perubahan

- Ganti tanah hijau polos dengan Rocky Terrain02 PBR: diffuse, normalGL, roughness, WebP1K.
- Dua tile terrain270m dengan profil bukit periodik. Area road+shoulder tetap rata; tidak ada perubahan collision/sim. Tile direcycle tanpa akumulasi geometry atau objek selama run.
- Ganti pine/rock low-poly dengan Tree Small02 dan Rock Moss Set02. Material PBR dan alpha model asli dipertahankan, geometry baked sekali dan setiap part dirender dengan instancing (16 pohon,16 cluster batu). Tidak menyalakan shadow-casting tambahan untuk seluruh vegetasi.
- PosisiY objek mengikuti terrain. Geometri instance milik komponen dibersihkan saat unmount; GLTF/material cache tidak dimutasi/dispose.
- Langit dan environment balapan Kloofendal Pure Sky1K; ambient/direct disesuaikan, fog110–250m. Showroom tetap menggunakan HDRI sebelumnya.
- Aspal PBR yang sudah ada dipertahankan. Terrain/scenery/HDRI memiliki fallback agar gagal unduh tidak mematikan gameplay.
- Sekitar3,18MB aset runtime baru. Sumber resmi, lisensi, checksum, ukuran, dan jumlah segitiga ada di frontend/public/assets/landscape/manifest.json serta frontend/LICENSES.md.
- Import ulang: dari frontend, node scripts/import-landscape.mjs <folder-raw-sementara>. Bukan dependency baru; memakai tooling glTF/sharp yang sudah ada.

## Verifikasi

Tiga tes layout PASS: jalan/shoulder rata di bawah permukaan aspal, sambungan height periodik, dan dua tile menutup corridor pandang pada travel jauh. Tidak ada klaim FPS/performa perangkat atau verifikasi visual; pengguna memeriksa tampilannya. Hasil build final dicatat di bawah.

## Batas

Rumpun grass3D terpisah belum ditambahkan; tekstur terrain sudah memuat grass/rocks. Landscape ini bukan map lokasi geografis dan tidak mengubah panjang/aturan jalan empat lajur. Perubahan layar penuh dari sesi sebelumnya tetap dijaga. Tidak commit/push/deploy pada sesi ini.

## Hasil kode dan aset

Typecheck frontend dan build awal PASS (Vite1m40s); warning dependency/chunk besar tetap ada. Pemeriksaan bounds sumber rock cluster: lebar10,28m dan kedalaman4,24m pada skala output; pohon4,48m×6,59m. Cluster batu diletakkan minimal16,5m dari sumbu jalan agar seluruh rotasi/skala berada di luar permukaan balap. Setelah penyesuaian jarak ini hanya bundling Vite diulang; tidak ada pengulangan suite atau audit visual.
Bundle final setelah penyesuaian jarak batu PASS (Vite1m08s). Typecheck sebelumnya PASS; perubahan terakhir hanya konstanta jarak penempatan. Warning chunk besar/PURE tetap ada.
