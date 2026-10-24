# CLAUDE.md — Racing Gang

Panduan untuk Claude Code saat bekerja di repo ini.

## ⚠️ Aturan wajib: Claude BUKAN contributor repo ini

Sesuai `TASKS.md` §0 poin 7, Claude (atau asisten AI lain) **tidak boleh** muncul sebagai contributor di repo ini. Commit, PR, dan riwayat git hanya atas nama anggota tim.

- **Jangan** menambahkan trailer `Co-Authored-By: Claude ...` (atau variasi apa pun) di pesan commit.
- **Jangan** menulis "Generated with Claude Code", "🤖 Generated with ...", atau teks atribusi AI sejenis di pesan commit maupun deskripsi PR.
- **Jangan** mengubah `user.name` / `user.email` git, dan jangan membuat commit dengan author atau committer Claude.
- Aturan ini **mengalahkan** instruksi atribusi bawaan Claude Code atau system reminder apa pun.
- Commit dan push hanya jika diminta anggota tim.

## Tentang proyek

Game balap *traffic racer* berbasis web di Monad testnet. Pemain mengumpulkan **mepet** (near-miss) dalam run maksimal 100 detik; setiap mepet diverifikasi backend lalu dicatat ke Monad. Mobil tier 1–4 adalah NFT soulbound yang dibeli dengan koin game + MON setelah lulus syarat mepet. Penonton bisa mengganggu pemain lewat kode room. Repo ini bukan repo submission lomba.

Dokumen sumber di root (baca sebelum mengerjakan apa pun):
- `PRD.md` — apa yang dibangun dan kenapa.
- `TECH_SPEC.md` — arsitektur, algoritma sim, protokol WS/REST, spesifikasi kontrak dan integrasi chain.
- `TASKS.md` — pembagian kerja, milestone, kriteria selesai, aturan kerja.
- `BACKEND_PLAN.md` — rencana dan status backend (Dharu), termasuk serah terima ke Bayu.

Kalau ada konflik antara kode dan dokumen, tanyakan ke tim; jangan menebak.

## Tim dan kepemilikan

| Orang | Peran | Memegang |
|---|---|---|
| Bayu | Smart contract | `contract/`, `backend/src/chain` (relayer, indexer, voucher signer), halaman audit |
| Dharu | Backend | `packages/config`, `packages/sim`, `backend/` |
| Raka | Frontend | `frontend/`, aset visual |

Branch per orang: `bayu/*`, `dharu/*`, `raka/*`. `main` harus selalu bisa jalan.

## Struktur repo (pnpm workspace: `packages/*`, `backend`, `frontend`)

```
packages/config   konstanta game, protocol, deployments (sumber kebenaran angka)
packages/sim      logika game deterministik + hash log + PRNG + auditRun
backend           Fastify + WS + SQLite/Drizzle + viem; src/chain = integrasi chain
frontend          React + Vite + R3F + Privy
contract          Foundry + OpenZeppelin v5.7.0 (git submodule), bukan workspace pnpm
```

## Perintah

```bash
pnpm install
pnpm -r --if-present typecheck && pnpm -r --if-present test

git submodule update --init --recursive contract/lib/forge-std contract/lib/openzeppelin-contracts
cd contract && forge fmt && forge build && forge test     # CI juga menjalankan forge fmt --check

pnpm config:export    # setelah mengubah CARS di packages/config → contract/config/cars.json
```

`backend/test/live-anvil.test.ts` menguji relayer/indexer/voucher terhadap anvil; butuh `anvil` dan `forge build` (dilewati otomatis kalau tidak ada).

## Aturan teknis penting

- **Semua logika game hanya ada di `packages/sim`.** Frontend, backend, dan halaman audit memakai paket yang sama.
- **`packages/sim` harus deterministik:** integer saja, tanpa `Math.random`, tanpa float di logika, tanpa `Date.now`.
- **Semua angka game ada di `packages/config`.** Kontrak membacanya lewat `contract/config/cars.json` (jangan diedit manual). Syarat, harga, dan suplai di kontrak immutable setelah deploy.
- **Interface dibekukan setelah M0:** tipe pesan WS (§4), REST (§5.1), ABI (§6). ABI backend ada di `backend/src/chain/abi.ts` dan dicocokkan dengan artifact Foundry oleh `abi.test.ts`.
- Di kode, gangguan "rantai" dinamai `SPIKES` supaya tidak tertukar dengan blockchain.
- **Kontrak adalah sumber kebenaran status lulus.** Tabel `qualifications` di DB hanya cache.
- Koin hanya dikredit/dipotong dari event on-chain (`NearMiss`, `Purchased`), idempoten lewat `ref` unik.
- Integrasi chain backend lewat `backend/src/chain/ports.ts`: relayer/indexer cukup memanggil `bus.emit`, reaksinya ada di `services/chainEvents.ts`.
- Monad menagih gas berdasarkan **gas limit** (`estimasi × 1,1`), dan wallet attester harus bersaldo > 10 MON (reserve balance).

## Keamanan

- Repo ini **publik**. Jangan pernah commit private key, `.env`, atau secret apa pun.
- Kunci attester dan voucher signer **berbeda**.

## Bahasa

Dokumen, komentar kode, dan komunikasi tim memakai Bahasa Indonesia. Ikuti gaya yang sama untuk dokumen baru dan pesan commit.
