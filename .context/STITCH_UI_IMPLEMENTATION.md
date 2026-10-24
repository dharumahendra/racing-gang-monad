# Racing Gang — implementasi UI dari Stitch

22 Oktober2026. Basis Git295c57f pada raka/foundation. Sumber: project “Racing Gang Design System”, ID5583154990675470015. Pilihan pengguna: Daylight Grand Prix sebagai default, Cyber Arcade Drift lewat toggle. Commit/push final dicatat di STITCH_UI_GIT_RESULT.md.

## Hasil

- Frame cockpit: navigasi empat tujuan yang berfungsi, header Google/tema, navigasi ringkas di tablet/HP, dan penjelasan mode data yang jujur.
- Garasi showroom: lima mobil shared config, daftar tier, model Quaternius asli pada podium/grid3D, kontrol putar/reset, spesifikasi, harga, status dimiliki/qualified dari akun bila tersedia, serta jalur latihan/room/penonton. Tombol latihan tersedia pada layar pertama.
- Space Grotesk untuk heading/angka dan Plus Jakarta Sans untuk isi. Font variable disajikan lokal, dengan dua lisensi OFL asli dan manifest sumber Google Fonts.
- Token semantik warna, surface, spacing4/8, radius4/8 dan state diterapkan ke garasi, formulir, room, penonton, hasil, HUD dan warning. Penampilan SDK Privy mengikuti tema.
- Preferensi tema disimpan lokal, dipulihkan setelah reload, disinkronkan antartab dan tetap dapat diganti saat storage diblokir. Preferensi ini terpisah dari token/profil akun.
- State pending tombol gangguan penonton diperbarui langsung setelah klik; tidak lagi menunggu interval render200ms. Batas pengiriman dan otorisasi tetap di client/server yang sama.

Foto mobil, statistik312km/j, serverTokyo, lap record, nitro fuel, tuning/livery dan fitur dekoratif dari contoh Stitch tidak dipakai sebagai data produk. Perubahan ini menggunakan objek/data game yang tersedia. Fisika, transport, aturan ekonomi dan transaksi tidak berubah.

## Verifikasi

| Pemeriksaan | Bukti |
|---|---|
| FE unit | **110 PASS**, termasuk3 tes preferensi tema baru |
| Backend integrasi | **4 PASS** melalui HTTP/WS, verifier JWT dan DB asli; chain/lookup user eksternal fixture |
| Typecheck FE | PASS |
| Build produksi | PASS, 2m29s; warnings third-party PURE/chunk besar masih ada |
| Regresi browser | **54 kelompok PASS**: browser10, network10, HUD11, rooms12, results11 |
| Browser desain | **9 kelompok PASS**, kedua tema pada lebar320/390/600/768/1100/1440, kontrol model/keyboard, font, reload, antartab, storage diblokir dan public watch |
| SDK Privy nyata | Konfigurasi app HTTP200; tombol login tetap siap setelah dua pergantian tema, error halaman0 dan protected POST0. Belum login akun nyata |
| Inspector visual | Sebelum2FAIL/5WARN → sesudah0FAIL/2WARN, pada1440/768/390. Allowance hanya micro-label untuk label teknis uppercase sesuai Stitch |
| Review | Reviewer independen tidak menemukan Critical/Important; satu ukuran petunjuk mobile10px diperbaiki menjadi11px. Perbaikan pending state dan harness sesudah review diperiksa sendiri + regresi |

Browser memakai Edge headless. Ini membuktikan interaksi/render lokal; bukan acceptance Google OAuth, sesi akun nyata saat ganti tema, testnet atau perangkat demo. Profil100detik tidak diulang; showroom memakai frameloop demand dan gameplay renderer tidak berubah.

## Perbaikan dari pemeriksaan

- Tes browser membuktikan tema default belum ada sebelum implementasi, tombol mulai belum terlihat, dan kontras tombol cyan/putih hanya4.095:1. Setelah implementasi, tesnya lulus. Primary action terang memakai #0369A1, varian hover resmi Stitch, untuk kontras≥4.5; aksen tetap #0284C7. Dark memakai #15EAE2 dengan teks gelap.
- Label diperbesar sampai minimal11px; nilai data/spec utama12–46px. Daftar mobil HP menampilkan dua kartu utuh yang bisa digeser, sehingga teks kartu berikutnya tidak terpotong di tepi viewport.
- HUD awal dua kali gagal8vs6 pada jumlah bunyi: countdown kedua dari warning yang overlap dapat tiba setelah unmute. Harness sekarang menunggu kedua countdown terlihat saat muted sebelum menguji bahwa unmute tidak mengulang cue lama; assertion tetap ada,11 kelompok kemudian lulus. Audio produksi tidak diubah.
- Network awal timeout ketika sim lokal sudah tabrakan pada tick191 saat rangkaian outage. Dua rerun terisolasi tanpa perubahan test/transport/sim lulus. Penyebab keterlambatan awal belum dipastikan; ini dicatat sebagai flakiness pengujian yang tersisa.
- Pending visual penonton gagal pada pemeriksaan satu kiriman aktif; penambahan render langsung setelah send membuat12 kelompok room lulus.

## Keputusan dan batas

- Gunakan komposisi/token Stitch pilihan pengguna sebagai acuan; tidak mengganti palet/font dengan hasil draw acak skill. Data tetap dari config/backend, model tetap aset yang sudah dipilih. Risiko penyesuaian komposisi adalah preferensi visual; screenshot dan preview disediakan untuk iterasi.
- Dua warning inspector dipertahankan secara sadar: outline mekanis/selected card mengikuti Stitch, dan metadata cockpit dominan11–12px; nilai/kontrol utama lebih besar. Label tidak di bawah11px. Lint statis0FAIL/40WARN, terutama label uppercase, indeks, shadow dan kata unlock pada kode audio/test; bukan semua warning merupakan UI yang dilihat pengguna.
- Google OAuth/provisioning wallet, transaksi pembelian, ABI/deployment/relayer/indexer, resume gameplay setelah reload dan playtest fisik masih mengikuti gap integrasi sebelumnya. Tidak ada deployment atau merge ke main.
- Konfigurasi MCP/API key tetap di konfigurasi lokal Codex; tidak disalin ke repo atau artefak desain. Estimasi FE50jam tetap baseline, bukan timesheet aktual.

Token/sumber lengkap ada di .context/STITCH_DESIGN_SYSTEM.md. Screenshot dan laporan JSON disertakan di outputs; hasil CI remote belum dinyatakan lulus.
