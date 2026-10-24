# Sinkronisasi FE dan backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans inline; user has requested execution. Preserve current branch and use red→green regression tests.

**Goal:** Gabungkan main dan patch backend terbaru ke branch FE, perbaiki kontrak seed/auth/summary serta buktikan FE melawan backend asli lokal.

**Architecture:** Pertahankan PlayClient/WatchClient dan shared sim. Backend Fastify/DB/verifier tetap asli dalam integration test; hanya layanan Privy eksternal serta chain ditiru menggunakan key test baru yang tidak pernah masuk Git. Identity berasal token terverifikasi; public watch/summary tetap publik. Jangan mengirim transaksi.

**Tech Stack:** React/Vite/TypeScript, pnpm monorepo, Vitest, Fastify/SQLite, Playwright Edge.

## Global Constraints

- Branch raka/foundation, starting HEAD55f2dfe; remote main e91a03f dan latest Dharu98b8993, fetch ulang sebelum merge.
- Shared config/sim berasal branch Dharu; perubahan FE tidak mengganti aturan game. Tidak menggunakan App Secret yang pernah dibagikan dalam chat.
- Ruling: kerjakan in-place atas permintaan sinkronisasi branch existing, dengan clean worktree dan checkpoint Git yang sudah dipush; tidak membuat worktree/branch lain atau menanyakan izin rutin kembali.
- Ruling: latest Dharu mencakup main dan perbaikan reconnect yang dibutuhkan; integrasikan setelah membaca diff tiga commit dan jalankan test seluruh workspace. Tidak merge feature ke main.
- Scope 'benerin semua': semua ketidakcocokan integrasi yang dapat direproduksi. ABI/deployment/live signer dan kredensial Google nyata tetap dependensi, bukan dibuat atau dipalsukan.

### Task 1: Gabungkan dependency dan source tim

Files: pnpm-lock.yaml, .context/{PRD,TECH_SPEC,TASKS,BACKEND_PLAN}.md (rename merge), backend/packages dari Git Dharu.
- [x] Review git diff main...monad-checks; pastikan ancestry.
- [x] git merge --no-ff --no-commit origin/dharu/monad-checks, pertahankan perubahan kedua sisi; regenerasi lockfile dengan pnpm install.
- [x] Jalankan root pnpm test/typecheck dan FE build untuk baseline gabungan; reproduksi dan catat gagal sebelum perbaikan.

### Task 2: Seed dan lifecycle client

Files: frontend/src/lib/{runner,play-client}.ts dan *.test.ts.
Consumes: PlayS2C run.go {startAt,seed?:Hex}; produces same PlayClient runner object with effective seed before countdown.
- [x] Tambah tes seed berbeda POST/go, parity sim/log, malformed seed ditolak, duplicate go tidak reset sim, local mode seed tidak berubah.
- [x] Jalankan Vitest file PlayClient, harapkan RED seed/payload validation.
- [x] Implementasi minimal mengganti state sim sebelum start tanpa mengganti runner yang dipakai komponen. Jangan reset run aktif saat reconnect.
- [x] Jalankan file tes lalu suite FE.

### Task 3: Kontrak profil/hasil/voucher dan label chain

Files: frontend/src/lib/{api,privy-session,run-summary,voucher-api}.ts + tests, UI consumer terkait bila diperlukan.
- [x] Reproduksi error provider/wallet dan schema finalHash dengan fixture kontrak baru. Periksa respons chain mode dari backend/config untuk label receipt mock.
- [x] Sediakan pesan yang dapat dipulihkan untuk WALLET_NOT_READY/UNAVAILABLE tanpa auto-retry POST atau mengubah identitas.
- [x] Adapter POST vouchers memvalidasi buyer/tier/cost/nonce/expiry/signature, memakai token baru, tidak mencoba transaksi atau POST ulang ketika respons ambigu; uji RED→GREEN jika dibuat.
- [x] Periksa T06 tetap gate ABI/deployment dan tidak mengklaim buy selesai; halaman audit P1 tidak ditambahkan pada scope perbaikan integrasi ini.

### Task 4: Acceptance lokal dan handoff

Files: integration test/harness di frontend atau backend sesuai runtime existing; .context/SYNC_IMPLEMENTATION.md, FRONTEND_PLAN.md, README.
- [x] Integration test menjalankan handler+verifier+DB asli untuk token invalid, akun A/B, room/run/penonton/reconnect/summary serta mode seed event dan local.
- [x] Run root suite/typecheck, FE build, browser regressions sesuai perubahan. Perbaiki setiap kegagalan nyata; tidak menutupi dengan menurunkan assertion.
- [x] Final fresh-context whole-diff review mengikuti executing-plans; perbaikan penting diuji RED→GREEN.
- [x] Catat hasil dan batas Google/testnet, checkpoint perubahan scoped pada branch FE; tidak deploy/merge main atau transaksi. Ringkas ke pengguna dan simpan artifact laporan.


## Hasil pelaksanaan

Seluruh langkah lokal di atas selesai; rincian bukti dan dependency nyata di SYNC_IMPLEMENTATION.md. Ruling tambahan: integration test menemukan watermark terminal kurang satu tick, diperbaiki dengan regresi RED→GREEN. Normalisasi Git tidak memperbaiki checkout CRLF existing, sehingga guard test diubah agar memisahkan LF/CRLF, tetap mendeteksi pemakaian kode terlarang. Dua kasus regresi membuktikannya. Tidak mengubah aturan sim atau kontrak ekonomi. Final fresh-context review integrasi tidak menemukan isu penting; perbaikan guard test sesudah review diperiksa sendiri dan root suite dijalankan ulang.
