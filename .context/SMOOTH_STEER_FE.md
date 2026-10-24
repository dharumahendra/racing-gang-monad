# FE setir tahan — 24 Oktober 2026

## Basis dan perubahan

- Fast-forward dari e015678 ke origin/dharu/smooth-steer 2957341. Termasuk sim CONFIG_VERSION2, patch input5/6 dari Dharu dan progres live-integration yang menjadi ancestor branch tersebut.
- Tidak mengubah aturan sim, ekonomi, ABI, atau snapshot penonton. Perubahan lokal metadata, QR dan audit tetap ada.
- driving-input.ts: setiap keyboard/pointer memiliki source berbeda, satu aksi ON selama salah satu source masih ditahan. OFF hanya ketika source terakhir dilepas. Key repeat/keydown ganda tidak menambah ON.
- use-driving-controls.ts: pengikatan keyboard dan controller yang sama untuk sentuh. Field form tidak ditangkap; keyup tetap melepas tombol yang sebelumnya aktif. Idle/countdown tidak menghalangi scroll keyboard. Blur/visibilitychange/unmount dan fase non-running membersihkan input.
- DrivingControls.tsx: kiri/rem/kanan tahan pada perangkat sentuh, pointer capture dan release up/cancel/leave/lost capture. Keyboard Space/Enter juga bisa menahan tombol; blur tombol melepas sumber tersebut. CSS touch-action:none dan tanpa seleksi teks.
- Practice dan Online memakai kontrol yang sama. Jalur online tetap lewat PlayClient.input agar input lepas ikut urutan seq/buffer jaringan.
- RaceScene sudah memakai interpolasi player.x per frame sebelum perubahan ini; dipertahankan. targetLane hanya informasi snapshot/diagnostik, tidak digunakan untuk menempatkan mobil pemain. steer tidak diberi efek visual baru.
- Ringkasan run versi lama tetap dapat dibaca dengan pemberitahuan differs/no replay. Validasi createRun dan audit tetap memeriksa CONFIG_VERSION aktif.

## Bukti

53 tes terarah PASS: driving input9, play client27, runner4, run API6, audit3, integrasi adapter audit4. Termasuk alias tombol, repeat, posisi berhenti di antara pusat lajur, semua pelepasan pointer, blur/visibility/unmount, dan OFF yang buffered saat offline lalu dikirim sekali sesudah reconnect. Typecheck termasuk dalam build final; hasil akhirnya dicatat di bawah.

Tidak menjalankan verifikasi visual/browser/perangkat fisik. Pengguna memeriksa rasa kontrol dan tampilan. Tidak ada commit, push, transaksi, atau deployment pada pekerjaan ini.

## Pengecekan manual pengguna

1. Tahan kiri/kanan: mobil terus bergerak; lepas setelah sedikit bergeser: berhenti tanpa snap ke pusat lajur.
2. Tahan A dan panah kiri; lepas salah satunya: tetap menyetir sampai keduanya dilepas.
3. Tahan kiri lalu kanan; lepas kanan: kembali mengikuti kiri sesuai sim.
4. Pindah tab/fokus saat menahan: setelah kembali tidak ada setir/rem tersangkut.
5. HP: tahan tombol; lepaskan, geser keluar, atau batalkan gesture. Tombol lain/keyboard yang masih ditahan tidak boleh dilepas oleh pointer berbeda.
6. Online: putus jaringan sambil menyetir, lepas, reconnect: tidak ada ON/OFF ganda.
7. Restart FE dan backend pada shared CONFIG_VERSION2 yang sama. Run lama versi1 menampilkan differs/no replay; jangan paksa replay atau ubah version di payload.
Script browser practice/network/browser diperbarui dari keyboard.press sekali menjadi down → tunggu x bergeser → up → tunggu steer0. Ketiganya lolos node --check; tidak dijalankan sebagai verifikasi visual.

## Hasil akhir

Build FE (termasuk tsc --noEmit) PASS, Vite 1m35s. Warning PURE dependency dan ukuran chunk besar tetap ada. Tidak ada pemeriksaan visual tambahan.
