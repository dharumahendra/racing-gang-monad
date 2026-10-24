# Handoff untuk Codex — Racing Gang

Snapshot: sesi Kiro, lanjutan dari `handoff_last.md`. Folder lokal: `C:\Belajar\Sem5\Momonad`.
Dokumen ini merangkum yang dikerjakan sesi ini, kondisi Git aktual, dan sisa pekerjaan. Baca `handoff_last.md` untuk konteks prioritas asli dan `CLAUDE.md` untuk aturan repo.

## Kondisi Git aktual (penting)

- Repo: https://github.com/dharumahendra/racing-gang-monad — branch `raka/modification`, tracking `origin/raka/modification`.
- **Sudah di-commit + push:** `5c1898c` "feat(frontend): leaderboard, seed practice acak, manifest kontrak baru, dan gas limit buy()". Author/committer **rakaSamud** (bukan AI — sesuai CLAUDE.md, tidak ada atribusi AI).
- **Masih UNCOMMITTED di working tree (pekerjaan audio, poin 6):**
  - `frontend/src/lib/engine-audio.ts` (baru)
  - `frontend/src/lib/engine-audio.test.ts` (baru)
  - `frontend/src/lib/use-warning-audio.ts` (diubah)
- **JANGAN disentuh / bukan pekerjaan sesi ini (file kerja lokal orang lain, pertahankan apa adanya):**
  - `backend/test/play.ts`, `backend/test/recovery.test.ts`, `backend/test/play-helper.test.ts`
  - `handoff_last.md`, `handoff_codex.md` (dokumen)

Aturan tetap berlaku: jangan commit/push/merge PR/deploy/mint/transfer tanpa instruksi pengguna. Jangan force-push/reset/clean. Jangan atribusi AI di commit (CLAUDE.md §0). Verifikasi visual/audio dilakukan pengguna; CI/test hijau bukan bukti alur live.

## Yang dikerjakan sesi ini

### Prioritas 1 — Sinkronisasi manifest kontrak dari main (SELESAI, sudah di `5c1898c`)
- `packages/config/deployments/monad-testnet.json` di-update ke deployment baru: deployBlock `73733089`, RunRegistry `0xe3c8edd37798d5e03553e4f6df191bc8586adaca`, CarNFT `0xd8a134916c85ace413289eaf674aedcd984ba736`, chainId tetap `10143`. ABI tidak berubah.
- Cara integrasi: dry-run merge `origin/main` terbukti bersih (tanpa konflik, tanpa menghapus pekerjaan lokal), lalu di-abort; hanya nilai manifest yang diterapkan sebagai edit working-tree agar tidak membuat merge commit. Artefak deploy Bayu (`contract/broadcast/...`) dan update dok/env-example dari main BELUM masuk — itu bagian merge penuh, keputusan tim. FE tidak membutuhkannya.
- FE sudah membaca alamat via `getDeployment()` dari shared config (dikonfirmasi di `public-audit.ts`, `purchase*.ts`, `config.ts`) — tidak ada hardcode alamat di komponen. `public-audit.test.ts` meng-assert chainId 10143 + CarNFT ABI valid; tetap lulus.

### Prioritas 2 — Seed Practice acak (SELESAI, sudah di `5c1898c`)
- Baru: `frontend/src/lib/practice-seed.ts` — `randomSeed()` pakai `crypto.getRandomValues(new Uint8Array(32))` → bytes32 hex yang divalidasi `Sim` (`isHex32`). Pola mengikuti `play-client.ts`.
- `frontend/src/pages/Practice.tsx`: seed di-`useMemo` pada `attempt`, jadi tiap percobaan (termasuk Retry) dapat seed baru, stabil selama percobaan (tidak berubah oleh render ulang). Seed hardcode lama dihapus. Online tidak disentuh — tetap pakai seed otoritatif backend/chain.
- Tes `practice-seed.test.ts` (deterministik, tidak flaky): format hex benar termasuk leading-zero, diterima Sim, nilai beda antar panggilan.

### Prioritas 3 — Halaman Leaderboard FE (SELESAI, sudah di `5c1898c`)
- Adapter `frontend/src/lib/leaderboard-api.ts`: `GET /leaderboard?limit=`, clamp limit 1–100, validasi ketat tiap entry (runId hex32, player address, carTier ≤ CARS.length-1, nearMisses ≤ RUN_TICKS, endedAt uint), tolak entri melebihi limit, tangani network/abort tanpa menelan AbortError, gagal cepat tanpa baseUrl. Plus helper `shortAddress()`.
- Halaman `frontend/src/pages/Leaderboard.tsx` (`LeaderboardPanel` + `Leaderboard`): ranking, alamat singkat, nama tier, jumlah mepet, tautan Result + Audit per run. Menangani loading/kosong/error/pembatalan (AbortController saat unmount & reload). Publik tanpa login. Disclaimer: listing di sini bukan bukti seluruh mepet final on-chain.
- Route `/leaderboard` (lazy) + tab nav "RANKS" (ikon `bolt`) di `App.tsx`. Styling di `result.css` (`.leaderboard*`, responsif).
- Tes `leaderboard-api.test.ts` (8 kasus deterministik). Catatan: build `tsc` lebih ketat dari test-run soal typing `vi.fn` — mock fetcher diketik `vi.fn<typeof fetch>()` agar `.mock.calls[i][0]` valid.
- Tipe dari shared protocol: `LeaderboardResponse` di `packages/config/src/protocol.ts`. Backend sudah siap: `backend/src/routes/leaderboard.ts` (hanya run `VERIFIED`/`PARTIAL`, urut nearMisses desc lalu endedAt asc).

### Permintaan tim (dari pesan Bayu) — dikerjakan, sebagian di `5c1898c`
- **Gas limit `buy()` (SELESAI, di `5c1898c`):** `frontend/src/lib/purchase-runtime.ts` fungsi `send` sekarang menghitung `gas = estimateGas × 1,1` sendiri sebelum `sendTransaction`, dengan fallback ke default wallet kalau estimasi gagal (tidak memblokir pembelian). Alasan: Monad menagih gas dari gas limit, bukan gas terpakai — kalau wallet set limit kebesaran, pembeli rugi. `PurchaseFlow` deterministik tidak berubah; 18 tes `purchase.test.ts` tetap lulus.
- **Metadata Tier 1–4 (SELESAI, di `5c1898c`):** dijalankan `node scripts/prepare-nft-metadata.mjs https://racing-gang-monad.vercel.app/cars/` dari `frontend/`. `public/cars/1.json`–`4.json` sekarang `image` absolut `https://racing-gang-monad.vercel.app/cars/<tier>.png`. baseURI untuk Bayu: `https://racing-gang-monad.vercel.app/cars/`.
- **Double-send saat beli:** tidak perlu kode baru — `PurchaseFlow.buy()` sudah mencegah secara struktural (keluar lebih awal saat `busy`; tx yang sudah broadcast disimpan & di-resume, tidak dikirim ulang). Ini catatan operasional demo (jaga saldo presenter > 10 MON reserve), bukan gap kode.

### Poin 6 — Audio: suara mesin + efek mepet (SELESAI secara kode, UNCOMMITTED)
Pendekatan: synthesis WebAudio, nol file eksternal, nol lisensi aset.
- Baru `frontend/src/lib/engine-audio.ts` — kelas `EngineAudio`:
  - Suara mesin: loop kontinu (sawtooth + sub-sine → lowpass), pitch & gain naik mulus mengikuti `view.player.speed` dinormalisasi ke `CARS[tier].maxSpeed` (pakai `setTargetAtTime`).
  - Efek mepet: whoosh singkat triangle 880→220 Hz (~0,2 s), sekali per `index` near-miss (dedup via `seen` Set).
  - Gating sama dengan `WarningAudio`: hanya bunyi setelah unlock gesture, hormati mute, diam saat `!playing || !visible`, stop saat resetRun/unmount/dispose. Semua error WebAudio ditelan.
- Diubah `frontend/src/lib/use-warning-audio.ts` — hook sekarang mengelola `WarningAudio` + `EngineAudio` di balik satu API `{state, unlock, toggle}` (satu tombol `AudioControl`, satu unlock gesture, satu mute `localStorage 'racing-gang:warning-muted'`, dibersihkan bersama). Loop update ~100ms (via `revision`) kini juga memberi makan engine kecepatan + iterasi `runner.events` untuk NEAR_MISS.
- `WarningAudio` dan `warning-audio.test.ts` TIDAK disentuh (8 tes tetap hijau). Dua halaman pemakai (Practice, Online) tidak perlu diubah karena API hook sama.
- Tes baru `engine-audio.test.ts` (7 kasus): unlock gesture, loop on/off per playing+visible, dedup mepet, mute, resetRun, graceful failure (unsupported/blocked), pending-unlock-after-dispose.

## Verifikasi yang benar-benar dijalankan

- `pnpm --filter @racing-gang/config typecheck` dan `@racing-gang/frontend typecheck`: lulus.
- Suite FE penuh: **200 tes lulus** (baseline handoff 182 → +11 di `5c1898c` (seed+leaderboard) → +7 audio = 200).
- `pnpm --filter @racing-gang/frontend build` (tsc + vite): sukses. Peringatan chunk > 500 kB pra-ada (bundle Privy/wallet), tidak terkait perubahan ini.
- Diperiksa langsung (bukan inferensi): `https://racing-gang-monad.vercel.app/cars/1.json` sudah disajikan domain, tapi JSON yang LIVE masih versi lama (`"image":"1.png"` relatif) karena deploy Vercel mendahului regenerasi metadata. PNG reachable (content-type image/png).

## Dependency & gap tersisa

- **baseURI belum aman di-`setBaseURI`:** metadata absolut (`cars/*.json`) baru benar di on-chain setelah build terbaru ter-DEPLOY ke Vercel. Kalau Vercel auto-deploy dari `main` saja, perubahan belum live sampai branch di-merge ke `main`. Kabari Bayu HANYA setelah JSON absolut benar-benar live di domain. Memanggil `setBaseURI` tugas Bayu, bukan FE.
- **Audio (poin 6) belum di-commit/push.** Menunggu instruksi pengguna.
- **Login Privy tidak bisa ditekan (dibahas, belum ada perbaikan kode):** tombol `disabled` saat `!auth.configured` ("Google login is being set up") atau `!auth.ready` ("Setting up login…"). `configured` hanya true kalau Privy provider mount, yang butuh `settings.privyAppId` non-kosong + `localStorage` tersedia (`auth-runtime.tsx`). `VITE_PRIVY_APP_ID` di-inline saat build; `.env.local` lokal valid (25 char) tapi TIDAK berlaku untuk Vercel — di produksi harus di-set di Environment Variables Vercel. Penyebab paling mungkin di situs deploy: env var kosong di build Vercel, atau domain belum di allow-list dashboard Privy (SDK init gagal → `ready` stuck false). Belum diverifikasi di build deploy (tidak ada akses dashboard Vercel/Privy dari sini).

## Sisa prioritas yang belum dikerjakan (dari handoff_last.md)

- **Poin 4 (metadata koleksi):** Tier 1–4 sudah. Koleksi tambahan BELUM digenerate — menunggu keputusan kontrak (poin 5). Generator ada: dari `frontend`, `node --import tsx scripts/collectibles/prepare.mjs https://DOMAIN/collectibles/`.
- **Poin 5 (koleksi NFT mint/claim):** blocker — belum ada kontrak/ABI. Perlu sepakati standar (ERC-721/1155), suplai, gratis/berbayar/reward, transferability, penerbit/claimant, anti-double-claim (ditegakkan kontrak/server), + ABI/alamat kontrak terpisah dari CarNFT. Jangan pakai `buy()` Tier 1–4 atau baseURI CarNFT untuk koleksi.
- **Poin 7a (demo soulbound "coba transfer"):** perlu flow demo disepakati dengan Bayu (mis. `simulateContract` yang revert, tampilkan pesan — jangan transfer nyata).
- **Poin 7b (resume penuh setelah reload):** blocker backend/kontrak recovery (log/snapshot, urutan input, kepemilikan controller) — bukan scope FE. Jangan simpan state lokal lalu anggap otoritatif.

## Cara kerja hemat (ringkas)

Perintah dari root: `pnpm --filter @racing-gang/frontend test src/lib/NAMA.test.ts`, `... typecheck`, `... build`. Jalankan suite luas hanya bila dampak perubahan memerlukan. Jaga .env/key/token lokal, jangan cetak isinya. Verifikasi visual/audio pengguna. Logika game hanya di `packages/sim` (deterministik: integer, tanpa Math.random/Date.now/float). Semua angka game di `packages/config`.
