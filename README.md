# Racing Gang

Game balap jalan raya berbasis web. Pemain mengumpulkan **mepet** (near-miss); setiap mepet diverifikasi backend lalu dicatat ke Monad testnet. Mobil yang lebih cepat adalah NFT soulbound yang hanya bisa dibeli setelah lulus syarat mepet. Penonton bisa mengganggu pemain secara live lewat kode room.

Dokumen: [PRD](.context/PRD.md) (produk), [TECH_SPEC](.context/TECH_SPEC.md) (teknis), [TASKS](.context/TASKS.md) (pembagian kerja), [BACKEND_PLAN](.context/BACKEND_PLAN.md) (rencana dan status backend), [WORST_CASE_TESTS](.context/WORST_CASE_TESTS.md) (uji skenario terburuk dan hasilnya).

## Struktur

```
packages/config   konstanta game, tipe protokol WS/REST, alamat kontrak   (sumber kebenaran angka)
packages/sim      logika game deterministik; dipakai frontend, backend, dan audit
backend           Fastify + SQLite/Drizzle: auth, run, verifikasi, room, ledger, voucher, WS
frontend          React + Vite (lihat frontend/README.md)
contract          Foundry: RunRegistry dan CarNFT
```

## Prasyarat

Node 22.12+ untuk seluruh workspace dan pnpm 9 (`corepack enable`).

```bash
pnpm install
pnpm typecheck
pnpm test          # config, sim, backend + integrasi client FE, dan frontend
```

## Menjalankan backend

```bash
cp backend/.env.example backend/.env   # isi JWT_SECRET (≥ 32 karakter) dan konfigurasi Privy
pnpm --filter @racing-gang/backend dev # http://localhost:8080
```

Login utama: **Google lewat Privy**. Frontend mengirim access token Privy; backend memverifikasinya dan memakai embedded wallet pengguna sebagai akun game. Isi `PRIVY_APP_ID`, `PRIVY_VERIFICATION_KEY`, dan `PRIVY_APP_SECRET` dari dashboard Privy (secret hanya di backend). `ALLOW_SIWE_LOGIN=true` membuka login SIWE langsung dengan wallet, dipakai bot dan pengembangan.

`CHAIN_MODE=mock` (default) memakai chain palsu yang meniru aturan `RunRegistry`, jadi seluruh alur bisa dicoba tanpa testnet. Tx hash dan nomor blok di mode ini palsu; jangan dipakai saat demo. `CHAIN_MODE=live` butuh RPC Monad, kunci attester dan voucher signer, alamat kontrak, serta relayer dan indexer live.

Endpoint: `GET /me`, `GET /config`, `GET /health`, `POST /runs`, `GET /runs/active` (run aktif milik token, untuk rekonsiliasi POST ambigu), `GET /runs/:id`, `GET /runs/:id/log`, `POST /rooms`, `GET /rooms/:code`, `POST /vouchers`, `GET /leaderboard`, WebSocket `/ws/play` dan `/ws/watch`, serta `POST /auth/nonce` dan `/auth/verify` kalau SIWE diaktifkan. Detail di `TECH_SPEC.md` §4–5; tipe ada di `packages/config/src/protocol.ts`.

### Docker

```bash
docker build -f backend/Dockerfile -t racing-gang-backend .
docker run -p 8080:8080 -v rg-data:/data --env-file backend/.env racing-gang-backend
```

Jalankan **satu instance saja**: state run dan room ada di memori. Database SQLite ada di volume `/data`. Runbook lengkap (Privy dashboard, HTTPS/WSS, pemulihan kegagalan, checklist demo): [.context/RUNBOOK.md](.context/RUNBOOK.md).

## Script

| Perintah | Fungsi |
|---|---|
| `pnpm --filter @racing-gang/backend bot -- --url <api> [--parallel 5] [--speedhack] [--disconnect 5] [--room-wait 10]` | Bot pemain lewat jaringan; mencocokkan mepet lokal dengan backend |
| `pnpm --filter @racing-gang/backend spectators -- --url <api> --room <KODE> --count 50` | Uji beban penonton |
| `pnpm --filter @racing-gang/backend status -- --url <api>` | Cek kesiapan demo: health, kontrak, saldo attester dan voucher signer, median latensi on-chain |
| `pnpm --filter @racing-gang/backend check-monad` | Cek asumsi chain tanpa wallet: chainId, waktu blok, `BLOCKHASH` di EVM = hash blok RPC |
| `pnpm --filter @racing-gang/backend audit -- --url <api> --run <id> [--rpc <url> --registry <alamat>]` | Replay log publik satu run lalu cocokkan dengan catatan backend atau event on-chain |
| `pnpm --filter @racing-gang/backend stress -- --players 25 --spectators 50` | Uji beban: pemain real-time + penonton terhadap server sungguhan; cek mepet cocok dan jeda event loop |
| `pnpm --filter @racing-gang/backend crash-test -- --players 5 --kill-after 15` | Bunuh server paksa di tengah run, start ulang, cek DB, pemulihan, audit, dan koin |
| `pnpm --filter @racing-gang/backend bigdb -- --runs 50000` | Ukur endpoint baca dan rencana query di DB besar |
| `pnpm --filter @racing-gang/sim stats -- --seeds 200` | Statistik balance mepet per mobil (autopilot) |
| `pnpm --filter @racing-gang/sim fixtures` | Buat ulang golden fixture setelah logika sim atau `CONFIG_VERSION` berubah |
| `pnpm config:export` | Tulis `contract/config/cars.json` dari `packages/config` |

Bot login dengan SIWE, jadi server harus `ALLOW_SIWE_LOGIN=true`. Bot hanya untuk testing; jangan dipakai untuk meluluskan akun.

## CI

GitHub Actions (`.github/workflows/ci.yml`): typecheck, test, build, cek `cars.json` dan golden fixture tetap sinkron, Foundry (aktif setelah `contract/foundry.toml` ada), serta build dan smoke test image Docker backend.

## Kontrak di Monad testnet

Belum di-deploy. Alamat dan tautan explorer akan ditulis di sini dan di `packages/config/deployments/monad-testnet.json`.
