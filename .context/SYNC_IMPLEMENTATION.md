# Sinkronisasi FE/backend — 22 Oktober 2026

Status: perubahan integrasi lokal selesai dan terverifikasi. Riwayat Git tetap pada branch `raka/foundation`; tidak ada deployment, transaksi, atau merge ke main. Hasil commit/push final dicatat terpisah dalam `SYNC_GIT_RESULT.md`.

## Basis yang digabung

- FE awal `55f2dfe1d336fdeb00ecef34f522966948a730aa`.
- Main `e91a03f0e79c72a8a238f5883cdbeee49c64f957` adalah ancestor dari `dharu/monad-checks` `98b8993960e036b1fdac1da09c33d59db4c75de2`.
- Branch Dharu mencakup server Privy, room/voucher, replay hasil setelah disconnect, pemeriksaan Monad, auditRun/finalHash. Merge membawa semuanya ke FE. Fetch akhir sebelum commit tidak menemukan perubahan ref tersebut atau branch FE remote.
- Satu konflik lockfile diselesaikan dengan mempertahankan dependency kedua sisi dan menjalankan pnpm install. Dokumen tim tetap di `.context`, dengan perubahan source tim dipertahankan.

## Perbaikan

| Masalah | Perilaku setelah diperbaiki |
|---|---|
| Seed POST berbeda dengan seed event `run.go` | Client memakai seed otoritatif sebelum start, mempertahankan referensi runner, dan tidak reset saat duplicate/reconnect. Seed malformed ditolak. |
| Run berakhir di antara interval watermark | Watermark tick terakhir selalu mendahului `run.end`, termasuk dalam antrean offline. Integrasi sebelumnya membuktikan server tertinggal satu tick. |
| Summary kontrak baru | Memvalidasi `finalHash`; seed boleh berubah hanya ketika status lama CREATED dan belum start. |
| Privy wallet/provider belum siap | Pesan dapat dipulihkan tanpa mengarahkan pengguna mengganti identitas. |
| Voucher belum memiliki adapter FE | Token segar; buyer/tier/cost/uint256 nonce/expiry/signature diperiksa. POST ambigu tidak otomatis diulang. Adapter hanya reservasi, tanpa pembelian/kredit lokal. |
| Receipt mock tampak seperti testnet | UI membaca GET `/health` dan menyatakan chain mock/live/unknown. Label live tidak menjamin transaksi telah tercatat. |
| Guard determinisme gagal pada komentar Windows | Parser test menerima LF/CRLF; komentar diabaikan, kode `Math.random()` tetap ditolak. Aturan sim tidak diubah. |
| CI memakai Node20 untuk Vite baru | Workspace CI memakai Node22; README root mengikuti lokasi dokumen `.context`. |

Regresi seed/auth/summary/watermark/guard dan adapter voucher dibuktikan RED→GREEN. Pemeriksaan label layanan juga gagal karena label belum tersedia sebelum implementasi, lalu lulus. Whitespace EOF tiga file backend incoming dirapikan tanpa perubahan logika.

## Bukti verifikasi langsung

| Pemeriksaan | Hasil |
|---|---|
| `pnpm install --no-frozen-lockfile` | PASS, dependency gabungan terpasang |
| `pnpm install --frozen-lockfile --offline --ignore-scripts` | PASS, lockfile konsisten; instalasi pertama sudah menjalankan native dependency |
| `pnpm -r --workspace-concurrency=1 test` | **233 PASS**: config9, sim43, backend74, FE107 |
| `pnpm -r --workspace-concurrency=1 typecheck` | PASS seluruh workspace |
| FE build | PASS, 1m56s |
| Browser Edge headless | **54 kelompok PASS**: browser10, network10, HUD11, rooms12, results11; termasuk golden3 |
| Browser label chain | **4 kelompok PASS**, tanpa POST/error halaman |
| Privy SDK nyata setelah sync | PASS: konfigurasi App ID publik HTTP200, tombol Google siap, error halaman0; tanpa login akun |
| Bundle produksi | Marker fixture network/rooms/results/performance tidak ditemukan |
| Review | Fresh-context reviewer tidak menemukan isu penting pada perubahan integrasi; bukan bukti service produksi. Guard test LF/CRLF yang ditambahkan sesudah review diperiksa sendiri dan root suite diulang. |

Regresi browser memakai transport simulasi untuk menguji UI, audio API, layout HP, polling, input/reconnect, serta status/receipt. Angka tes bukan bukti produksi atau transaksi berhasil. Tidak mengulang profiling100detik karena renderer/aset tidak berubah; bukti performa historis ada di T10_IMPLEMENTATION.md.

### Empat tes integrasi FE dengan backend asli

`backend/test/frontend.integration.test.mjs` membuka Fastify pada port lokal sementara. FE REST/PlayClient/WatchClient asli menggunakan HTTP/WS sungguhan, verifier JWT ES256 asli dan SQLite asli. Key test dibuat sementara per kasus. Hanya lookup user Privy eksternal dan chain memakai fixture/MockChain.

1. Mode seed local: create profil/room/run, public watch, NITRO, outage3detik, flush input, kehilangan seluruh koneksi ketika hasil terminal dikirim, reconnect/replay, parity finalHash/seed/mepet/receipt dan hasil penonton.
2. Mode seed event: alur sama, tetapi seed POST sengaja berbeda dari event backend; hasil tetap VERIFIED dan hash cocok.
3. Audience JWT salah ditolak sebelum lookup user; anonymous create401; akun B ditolak memakai room A, data run tidak berubah. Public room read tetap tersedia.
4. Voucher bertanda tangan mock nyata: reservation idempoten, buyer palsu akun B ditolak403 tanpa mutasi, reservation expired dilepas, nonce baru, belum ada pembelian/owned tier atau kredit saldo palsu.

Saat menyusun harness, clock diubah ke milidetik integer sesuai protokol; simulasi kehilangan hasil menutup seluruh aliran koneksi; cleanup menunggu socket server selesai sebelum DB ditutup. Assertion bisnis tidak dilonggarkan. Bug production yang ditemukan adalah watermark terminal, dan telah diperbaiki serta diuji regresi.

## Batas dan langkah berikutnya

1. Rotasi App Secret yang pernah dibagikan; pasang secret baru serta verification key di backend/.env/hosting, lalu uji Google/embedded wallet dengan dua akun nyata. Secret chat tidak dipakai atau disimpan di source/Git. App ID publik sudah terpasang.
2. Jalankan backend dengan env benar, arahkan FE `VITE_DATA_MODE=live`, API HTTP dan WS ke port backend. Mode data live tidak mengubah `CHAIN_MODE=mock` menjadi testnet. README menyediakan runbook lokal.
3. ABI/deployment/relayer/indexer/voucher signer tim masih dibutuhkan. Chain live saat ini sengaja menolak startup tanpa implementasi itu. UI pembelian dan audit publik belum dibuat; adapter voucher tidak mengirim transaksi.
4. Full reload/cross-tab gameplay resume dan pencarian run setelah POST ambigu belum tersedia; reload hanya membuka summary. Playtest kontrol/audio/performa pada perangkat demo dan acceptance deployment/testnet tetap diperlukan.

Warning install Privy mengenai versi viem internal serta warning chunk besar/PURE build masih ada; SDK readiness/typecheck/build lulus, tetapi tidak menyatakan seluruh flow OAuth terverifikasi. Docker image dan workflow GitHub Actions belum dieksekusi lokal; hasil CI remote perlu dilihat setelah push. Estimasi FE50jam tetap baseline, bukan klaim jam aktual.
