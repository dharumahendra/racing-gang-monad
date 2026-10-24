# Privy + Google — konfigurasi FE dan handoff backend

22 Oktober 2026 WIB. Keputusan pengguna: login utama menggunakan Privy dengan Google agar pemain tidak perlu memasang extension wallet. App ID publik sudah diberikan dan dipasang di .env.example serta .env.local yang di-ignore Git. Perubahan ini menggantikan jalur utama connect-extension + SIWE dari spesifikasi awal.

## Yang sudah disiapkan di FE

- SDK `@privy-io/react-auth`, provider lazy-load, `loginMethods:['google']`.
- Default/supported chain Monad testnet dari viem.
- `embeddedWallets.ethereum.createOnLogin:'users-without-wallets'` melalui modal bawaan Privy.
- Hook ready/authenticated dan wallet readiness dipisahkan. Akun balap dipakai setelah embedded Ethereum wallet tersedia.
- Tombol pemulihan pembuatan wallet jika login selesai tetapi wallet belum ada.
- `getAccessToken()` dipanggil lagi saat membaca profil; token tidak disimpan sebagai JWT game palsu di localStorage.
- Profil hanya ditampilkan setelah /me diterima dan address cocok; logout, pergantian subject/wallet dan respons lama diisolasi lewat generation counter.
- Tanpa App ID, SDK tidak dipasang di runtime dan tidak menghubungi Privy. Tombol Google nonaktif dengan keterangan; latihan lokal tetap publik.
- Halaman watch tetap publik dan tidak membutuhkan login/wallet.

Ini integrasi SDK yang lolos typecheck dan test FE, **belum bukti Google OAuth atau provisioning wallet end-to-end**. App ID tersedia; kesiapan dashboard/origin, Google OAuth dan provisioning wallet nyata masih perlu diverifikasi.

## Konfigurasi ketika app Privy sudah dibuat

1. Buat app di dashboard Privy dan aktifkan Google sebagai login method.
2. Aktifkan embedded Ethereum wallet. Solana tidak diperlukan untuk Monad.
3. Daftarkan origin/callback yang dipakai app. Dev default `http://127.0.0.1:5173`; preview sesi bisa memakai port lain, jadi masukkan origin yang benar-benar dibuka. Domain HTTPS produksi ditambahkan saat release disetujui.
4. Isi `frontend/.env.local` berdasarkan `.env.example`:

```dotenv
VITE_PRIVY_APP_ID=cmviy1ioq027u0gjjyqt4vypt
VITE_PRIVY_CLIENT_ID=<optional-public-client-id>
VITE_API_URL=<game-backend-yang-memverifikasi-token-privy>
```

App ID dan Client ID adalah konfigurasi publik. **Jangan memasukkan Privy App Secret, Google Client Secret, private key atau JWT_SECRET ke VITE_*.** Client ID boleh kosong bila tidak memakai app client terpisah. Restart Vite setelah mengubah env; production perlu build ulang.

5. Uji Google login dengan akun test, tanpa wallet extension. Pastikan hanya satu embedded wallet yang dipakai untuk akun tersebut, login ulang kembali ke wallet sama, logout menghapus profil, dan akun kedua tidak melihat profil akun pertama.

Modal bawaan Privy dipilih karena auto-create wallet pada login tersedia di flow ini. Dokumentasi menyatakan flow whitelabel seperti `useLoginWithOAuth` tidak otomatis memicu auto-create; karena itu FE tidak mengganti flow menjadi OAuth headless tanpa menangani pembuatan wallet secara eksplisit.

## Kontrak backend yang diperlukan Dharu

FE saat ini mengirim `Authorization: Bearer <Privy access token>` pada `GET /me`. Endpoint auth SIWE /auth/nonce dan /auth/verify tidak dipanggil oleh jalur Google. Header dan autentikasi endpoint berikut harus disepakati tim sebelum mode online dinyatakan berfungsi.

1. Verifikasi access token dengan SDK server Privy atau JWKS resmi: signature ES256, issuer privy.io, audience App ID yang benar, dan expiration. Jangan hanya decode JWT.
2. Ambil Privy DID dari klaim terverifikasi (`sub`), lalu peroleh linked embedded Ethereum wallet menggunakan data user server-side Privy yang terpercaya. Jangan percaya alamat/email/DID yang dikirim client sebagai bukti kepemilikan.
3. Tetapkan wallet canonical akun game di server. /me mengembalikan address tersebut. Simpan mapping Privy subject ↔ wallet agar koin, room dan mobil tetap terikat identitas yang benar. Kebijakan perubahan/link wallet memerlukan keputusan tim, bukan overwrite otomatis dari client.
4. Semua endpoint terlindungi dan WS play harus memakai identitas server ini. Saat reconnect WS, gunakan access token Privy segar; jangan memakai asumsi JWT SIWE 12 jam atau mendecode token di client untuk memberi hak akses.
5. Pertahankan gerbang ownership run, room host dan voucher buyer pada server/kontrak. Google login bukan izin mengakses wallet atau room milik orang lain.

SDK server baru yang ditunjukkan dokumen resmi adalah `@privy-io/node`:

```ts
// Contoh dari dokumentasi, bukan handler yang sudah dipasang dalam backend proyek.
const claims = await privy.utils().auth().verifyAccessToken({
  access_token: accessToken,
});
```

Konfigurasi SDK server, pembacaan user/linked-wallet, dan penyimpanan mapping dikerjakan bersama Dharu. Secret SDK server hanya ada di backend/hosting. File backend proyek tidak diubah diam-diam untuk menerima token tanpa verifier.

## Acceptance untuk integrasi nyata

| Kasus | Hasil yang diperlukan | Pemilik |
|---|---|---|
| Google user baru tanpa extension | Login sukses, embedded EVM wallet tersedia, bisa masuk game online | FE + dashboard + backend |
| Login ulang | Kembali ke akun/wallet yang sama, tidak membuat akun saldo baru | FE + backend |
| Akun A → logout → akun B | Profil/reservasi/koin A hilang dan tidak dipulihkan respons lama | FE; verifier server wajib diuji |
| Token salah signature/audience/expired atau tanpa token | Endpoint terlindungi menolak tanpa mutasi | Backend |
| Token A dengan permintaan wallet/room/voucher B | Ditolak oleh ownership/identity guard | Backend + kontrak |
| Token refresh | Request memakai token baru dari SDK; tidak memakai string token kedaluwarsa yang dicache | FE + backend |
| Buat/beli NFT | Tetap membutuhkan syarat, saldo dan konfirmasi transaksi yang sesuai; tidak ada buy otomatis saat login | FE + kontrak |

Google login mengurangi langkah onboarding; pendanaan gas relayer dan harga MON untuk pembelian tetap mengikuti desain ekonomi game. Gas sponsorship/pembayaran tambahan tidak dibuat dalam tahap ini.

## Referensi resmi yang diperiksa

- [Privy React setup](https://docs.privy.io/basics/react/setup)
- [Automatic wallet creation](https://docs.privy.io/basics/react/advanced/automatic-wallet-creation)
- [OAuth / Google](https://docs.privy.io/authentication/user-authentication/login-methods/oauth)
- [Access token verification](https://docs.privy.io/authentication/user-authentication/access-tokens)

Belum ada pesan yang dikirim ke Dharu/Bayu, perubahan dashboard, deployment, atau transaksi yang dilakukan.
