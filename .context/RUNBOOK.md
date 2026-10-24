# Runbook — Racing Gang (lokal dan demo)

Status 22 Oktober 2026. Chain live belum tersedia; semua langkah di bawah memakai `CHAIN_MODE=mock` kecuali disebut lain. Tx hash/blok mock bukan bukti Monad.

## 1. Prasyarat

- Node 22.12+, pnpm 9.15.4 (`corepack enable`). `pnpm install --frozen-lockfile` dari root.
- Satu instance backend saja: state run/room ada di memori, DB SQLite di file. Jangan scale horizontal.

## 2. Backend

1. `cp backend/.env.example backend/.env`, lalu isi (jangan commit; `.env` sudah di-gitignore):
   - `JWT_SECRET` ≥ 32 karakter acak.
   - `PRIVY_APP_ID` (publik), `PRIVY_APP_SECRET` (rahasia, hanya backend), dan salah satu: `PRIVY_JWKS_URL=https://auth.privy.io/api/v1/apps/<APP_ID>/jwks.json` (disarankan; publik, mendukung rotasi kunci — `kid` baru memicu ambil ulang maks. sekali per 30 dtk) atau `PRIVY_VERIFICATION_KEY` (PEM statis; boleh satu baris dengan `\n` literal). Bila keduanya diisi, JWKS yang dipakai.
   - `PUBLIC_ORIGIN` = origin FE persis (skema+host+port). `localhost` ≠ `127.0.0.1`; origin lain di `CORS_ORIGIN` (dipisah koma).
   - `DATABASE_URL` ke file DB khusus pengujian, mis. `./data/racing-gang.privy-test.db`.
   - `ALLOW_SIWE_LOGIN=true` hanya untuk bot/pengembangan; `false` di demo publik.
2. `pnpm --filter @racing-gang/backend start` (atau `dev` untuk watch). Start dingin `tsx` di laptop bisa 20 dtk.
3. Cek: `GET /health` → `ok:true`, `chainMode` sesuai; `GET /me` tanpa token → 401.

## 3. Frontend

`frontend/.env.local`:

```
VITE_DATA_MODE=live
VITE_API_URL=http://127.0.0.1:8080
VITE_WS_URL=ws://127.0.0.1:8080
VITE_PRIVY_APP_ID=<App ID publik>
```

`pnpm --filter @racing-gang/frontend dev` (Vite `--host 127.0.0.1`, port 5173). Vite membaca env saat start; restart setelah mengubah `.env.local`. Jangan pernah menaruh App Secret di variabel `VITE_*`.

## 4. Dashboard Privy (dilakukan pemilik akun)

Konfigurasi app pada 22 Oktober 2026 (dibaca lewat API Privy): `google_oauth=false`, embedded wallet `create_on_login=off`, `allowed_domains` kosong. Sebelum login Google nyata:

1. Login methods → aktifkan **Google**.
2. Embedded wallets → Ethereum → create on login untuk pengguna tanpa wallet (FE juga meminta `users-without-wallets`).
3. Allowed origins/domains → tambahkan origin yang dipakai (`http://127.0.0.1:5173`, `http://localhost:5173`, dan URL HTTPS hosting).
4. App Secret hanya di `backend/.env`/secret store hosting. Secret saat ini pernah ditulis di chat; pemilik memutuskan tetap memakainya (rotasi bisa dilakukan kapan saja di dashboard).

## 5. Demo publik (HTTPS/WSS)

- Backend di host yang mendukung WebSocket dengan TLS; FE memakai `https://` dan `wss://`. Mixed content (`https` FE ke `ws://`) diblokir browser.
- `PUBLIC_ORIGIN`/`CORS_ORIGIN` = domain FE produksi; tambahkan domain yang sama di Privy.
- Docker: `docker build -f backend/Dockerfile -t racing-gang-backend .` lalu `docker run -p 8080:8080 -v rg-data:/data --env-file backend/.env racing-gang-backend`. Volume `/data` wajib persisten.
- `pnpm --filter @racing-gang/backend status -- --url <api>` untuk cek kesiapan (health, kontrak, saldo signer saat live).

## 6. Pemulihan kegagalan

| Kejadian | Perilaku sistem | Tindakan |
|---|---|---|
| Backend mati/restart di tengah run | Saat start, run terbuka ditutup `PARTIAL` + flag `SERVER_RESTART` pada tick terverifikasi; mepet terverifikasi dan koin tetap; antrean relayer dibangun ulang dari DB (`crash-test` lulus) | Pemain membuka `/run/:id` untuk hasil; buat run baru |
| Reservasi voucher saat restart | Reservasi di DB, kedaluwarsa sesuai `expiry` lalu dilepas; tidak ada debit tanpa event pembelian | Tunggu kedaluwarsa atau minta voucher baru setelahnya |
| `POST /runs` timeout/respons hilang | FE tidak mengulang POST; tombol **Periksa run aktif** memanggil `GET /runs/active` | Jika run `CREATED` tanpa pengendali → dilanjutkan; jika sudah dikendalikan → tunggu hasil |
| Tab kedua/perangkat lain | Server menolak dengan `NOT_CONTROLLER` (close 4409); tab pertama tidak terganggu | Lanjutkan di tab pertama |
| Reload saat RUNNING | State sim browser hilang; halaman baru tidak dapat mengambil alih; run berakhir `PARTIAL` setelah batas waktu (100 dtk + 30 dtk grace) | Buka hasil; tidak ada resume penuh (keputusan desain, lihat SYSTEM_IMPLEMENTATION) |
| Privy `AUTH_PROVIDER_UNAVAILABLE`/`WALLET_NOT_READY` | 503/409; identitas tidak diganti | Coba lagi / selesaikan pembuatan wallet |

## 7. Verifikasi standar

```powershell
pnpm typecheck
pnpm test                       # bila timeout acak di backend, ulang: pnpm --filter @racing-gang/backend exec vitest run --no-file-parallelism
pnpm --filter @racing-gang/frontend build
pnpm --filter @racing-gang/backend crash-test -- --players 3 --kill-after 10
pnpm --filter @racing-gang/backend stress -- --players 25 --spectators 50
```

## 8. Checklist bukti demo

| Item | Bukti yang diminta | Status 22 Okt |
|---|---|---|
| Login Google akun A dan B, wallet berbeda, `/me` cocok | Screenshot/alamat tersamarkan, log 401 untuk token lama | BLOCKED (dashboard + login pemilik) |
| Run room + 3 gangguan dari 3 HP fisik | Video/foto, hasil `VERIFIED`, summary finalHash | BLOCKED (perangkat) |
| Mepet tercatat di Monad testnet | Tx hash + receipt sukses + event cocok | BLOCKED (kontrak) |
| Pembelian Tier 1 + transfer ditolak (soulbound) | Tx `buy`, revert transfer | BLOCKED (kontrak) |
| Audit replay run | `pnpm --filter @racing-gang/backend audit -- --url <api> --run <id>` | Lokal tersedia; on-chain BLOCKED |
| Akun presenter lulus lewat permainan sah | Run asli, bukan edit DB/bot | Belum |
