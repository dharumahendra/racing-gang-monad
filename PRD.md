# PRD — Racing Gang

**Versi:** Draft 1.2 · 21 Oktober 2026
**Lomba:** Monad Blitz Jogja Vol. 2 · Sabtu, 24 Oktober 2026 · GIK UGM
**Tim:** Bayu (Smart Contract) · Dharu (Backend) · Raka (Frontend)

> Semua angka di dokumen ini adalah **nilai awal untuk playtest**. Sumber kebenaran angka ada di `packages/config` (lihat `TECH_SPEC.md` §2). Kalau angka diubah, ubah di sana dan naikkan `CONFIG_VERSION`.

Dokumen terkait:
- `TECH_SPEC.md` — arsitektur, algoritma simulasi, protokol, spesifikasi kontrak.
- `TASKS.md` — pembagian kerja, urutan integrasi, kriteria selesai.

---

## 1. Ringkasan

Game balap jalan raya berbasis web untuk laptop, terinspirasi game *traffic racer* seperti Racing Limits. Pemain mengebut di jalan 4 lajur dan mengumpulkan **mepet** (*near-miss*): menyalip kendaraan lain dari lajur sebelahnya dengan kecepatan tinggi tanpa menabrak. Satu run berdurasi maksimal **100 detik**.

- Setiap mepet **diverifikasi backend**, lalu **dicatat ke Monad**.
- Pindah lajur biasa **tidak** dicatat on-chain.
- Mobil yang lebih cepat adalah **NFT soulbound**. Mobil hanya bisa dibeli jika pemain sudah lulus syarat mepet, punya koin game yang cukup, dan membayar MON.
- **Penonton** bisa masuk room dengan kode dan mengganggu pemain secara live: nitro paksa, rantai di jalan, dan red zone.

## 2. Tujuan

1. Gameplay arcade yang langsung dimengerti dalam 10 detik.
2. Bukti skill yang bisa diperiksa publik: syarat mobil dicek oleh kontrak dari catatan mepet on-chain.
3. Penonton ikut bermain saat presentasi.
4. Kecepatan Monad terlihat kasat mata: setiap mepet muncul on-chain dalam hitungan detik.

## 3. Bukan tujuan (MVP)

- Marketplace atau jual-beli mobil (mobil soulbound).
- Token game, koin on-chain, atau top-up koin dengan uang.
- Balapan multiplayer antar-pemain.
- Simulasi gameplay di dalam smart contract.
- Mainnet dan aplikasi mobile native.

## 4. Pengguna

| Peran | Perangkat | Perlu wallet? | Bisa apa |
|---|---|---|---|
| Pemain | Laptop (browser) | Ya, login dengan tanda tangan wallet | Main run, kumpulkan koin, buat room, beli mobil |
| Penonton | HP/laptop (browser) | Tidak | Masuk room dengan kode, kirim gangguan |

## 5. Gameplay

### 5.1 Jalan dan kontrol

- Jalan 4 lajur searah. Semua lalu lintas bergerak searah dengan kecepatan sama (±80 km/j), dan pemain selalu lebih cepat.
- Mobil pemain berakselerasi otomatis sampai kecepatan maksimumnya.
- Kontrol:
  - `←` / `A`: pindah ke lajur kiri.
  - `→` / `D`: pindah ke lajur kanan.
  - `↓` / `S` (tahan): rem. Kecepatan tidak pernah turun di bawah ±86 km/j.
- Kendaraan lalu lintas terdiri dari mobil biasa dan truk (±20%). Lalu lintas tidak pindah lajur, dan kepadatannya naik seiring jarak tempuh.
- Generator menjamin selalu ada minimal satu lajur yang bisa dilewati, jadi tidak pernah ada "tembok" kendaraan.

### 5.2 Run

- Hitung mundur 3 detik, lalu run berjalan maksimal 100 detik.
- Run berakhir jika: **waktu habis**, **menabrak kendaraan**, atau **berada di red zone yang aktif**.
- Mepet dan koin yang sudah didapat tetap berlaku meskipun run berakhir karena gagal.

### 5.3 Definisi mepet (v1, boleh disesuaikan)

Sebuah kendaraan dihitung **mepet** pada saat pemain selesai menyalipnya (bemper belakang pemain melewati bemper depan kendaraan), jika:

1. Selama menyalip, mobil pemain tidak bersentuhan dengan kendaraan itu.
2. Jarak samping terdekat (tepi ke tepi) selama menyalip ≤ **180 cm**. Dalam praktiknya: menyalip dari lajur tepat di sebelahnya.
3. Kecepatan pemain saat selesai menyalip ≥ **100 km/j**.
4. Setiap kendaraan hanya dihitung sekali.

Rantai, red zone, dan objek lain **bukan kendaraan** dan tidak pernah dihitung sebagai mepet. Algoritma lengkapnya ada di `TECH_SPEC.md` §3.6.

### 5.4 Koin

- Mepet mobil biasa: **+100 koin**. Mepet truk: **+200 koin**.
- Koin disimpan di database backend dan terikat ke alamat wallet pemain. Koin tidak bisa dibeli dan tidak bisa ditransfer.
- Koin resmi dikreditkan saat catatan mepet sudah masuk on-chain. Sebelum itu, UI menampilkannya sebagai "pending".
- Invarian: **saldo koin = total koin dari event mepet on-chain − total biaya koin dari event pembelian on-chain.** Siapa pun bisa menghitung ulang saldo koin dari chain.

### 5.5 Gangguan

Semua gangguan diberi **aba-aba 2 detik** sebelum aktif: penanda lajur berkedip, ikon, hitung mundur, dan suara.

| Gangguan | Efek | Durasi |
|---|---|---|
| **Nitro paksa** | Mobil tiba-tiba melesat hingga 1,5× kecepatan maksimum, dan rem tidak berfungsi | 3 detik, lalu kecepatan turun kembali ke normal |
| **Rantai jalan** | Muncul di satu lajur ±30 m di depan pemain. Jika dilindas, kecepatan turun setengah dan mobil tidak bisa berakselerasi selama 1,5 detik | Objek tetap di jalan sampai dilewati |
| **Red zone** | 1–2 lajur menjadi merah. Berada di lajur merah saat aktif berarti **run gagal** | 3, 5, atau 7 detik |

Sumber gangguan:
- **NPC (selalu aktif).** Jadwalnya ditentukan dari seed run: mulai sekitar detik ke-10, lalu setiap 8–12 detik. Ini tingkat kesulitan dasar yang sama untuk semua pemain, sehingga syarat mobil tetap adil meski tanpa penonton. NPC juga menjadi cadangan saat penonton sedikit atau koneksi putus.
- **Penonton (opsional).** Gangguan tambahan dari room. Penonton hanya bisa **mempersulit**, tidak bisa membantu.

Batas agar game tetap bisa dimainkan:
- Maksimal 1 nitro (aba-aba atau aktif) sekaligus.
- Maksimal 2 rantai di jalan sekaligus.
- Maksimal 2 lajur merah sekaligus. Red zone tidak pernah menutup semua lajur.
- Jeda minimal 1 detik antar-aktivasi gangguan.

Gangguan yang melanggar batas otomatis dibatalkan.

## 6. Mobil

"Semakin langka, semakin cepat." Starter gratis dan bukan NFT. Tier 1–4 adalah **NFT soulbound**: tidak bisa dipindahkan atau dijual.

### 6.1 Statistik

| Tier | Mobil | Kecepatan maks | Akselerasi | Waktu pindah lajur |
|---|---|---|---|---|
| 0 | Starter | ±180 km/j | Normal | ±0,39 dtk |
| 1 | Tier 1 | ±200 km/j | Normal | ±0,36 dtk |
| 2 | Tier 2 | ±220 km/j | Normal | ±0,33 dtk |
| 3 | Tier 3 | ±245 km/j | Cepat | ±0,30 dtk |
| 4 | Tier 4 | ±270 km/j | Cepat | ±0,27 dtk |

Mobil lebih cepat berarti lebih banyak peluang mepet, tapi juga lebih sulit dikendalikan.

### 6.2 Syarat dan harga

| Tier | Syarat mepet dalam 1 run (≤100 dtk) | Mobil yang dipakai saat run | Biaya koin | Harga | Suplai maks |
|---|---|---|---|---|---|
| 0 | — | — | Gratis | Gratis | Tak terbatas (bukan NFT) |
| 1 | 40 | Starter atau lebih tinggi | 3.000 | 0,05 MON | 1.000 |
| 2 | 75 | Tier 1 atau lebih tinggi | 10.000 | 0,1 MON | 300 |
| 3 | 110 | Tier 2 atau lebih tinggi | 25.000 | 0,25 MON | 100 |
| 4 | 150 | Tier 3 atau lebih tinggi | 50.000 | 0,5 MON | 30 |

Harga MON adalah nilai testnet.

### 6.3 Aturan pembelian

Semua syarat berikut harus terpenuhi bersamaan:

1. **Lulus syarat:** pemain pernah mencapai jumlah mepet yang disyaratkan dalam satu run memakai mobil yang disyaratkan. Status lulus tercapai **pada saat mepet ke-N tercatat**; tabrakan setelahnya tidak membatalkannya. Status lulus disimpan permanen di kontrak, jadi pemain boleh membeli belakangan.
2. **Koin cukup.** Koin dipotong hanya jika pembelian on-chain berhasil.
3. **Membayar harga MON** dari wallet pemain sendiri.
4. Pemain **belum memiliki** mobil tier yang sama, dan **suplai** tier itu belum habis.

Setiap NFT menyimpan ID run yang membuktikan kelulusan pemiliknya.

Kenapa soulbound: menjamin mobil hanya dimiliki orang yang benar-benar lulus syaratnya. Kelangkaan dijaga oleh tingkat kesulitan dan batas suplai yang tidak bisa diubah setelah deploy.

### 6.4 Alur pembelian dan siapa mengecek apa

1. Selama run, backend memverifikasi setiap mepet, lalu relayer mencatatnya ke kontrak `RunRegistry`.
2. Saat mepet ke-N tercatat dalam satu run (≤100 detik, dengan mobil yang disyaratkan), **kontrak** menandai pemain lulus dan memancarkan event `Qualified`.
3. Backend membaca event itu dan menyimpannya di database **hanya sebagai cache** untuk tampilan garasi.
4. Pemain klik Beli → backend mengecek dan menyisihkan koin, lalu menandatangani voucher.
5. Pemain memanggil `CarNFT.buy()` dari wallet sambil membayar MON. Kontrak mengecek voucher, status lulus di `RunRegistry`, harga, suplai, dan kepemilikan ganda, lalu mint NFT soulbound.
6. Koin baru dipotong setelah event `Purchased` terbaca.

| Syarat | Dicek oleh | Bisa dicurangi backend? |
|---|---|---|
| Task (N mepet dalam 1 run) | Kontrak | Tidak diam-diam: backend harus memalsukan catatan mepet, yang tercatat publik dan bisa ketahuan lewat audit |
| Koin cukup | Backend (lewat voucher) | Bisa, tapi ketahuan: saldo koin bisa dihitung ulang dari event on-chain |
| Bayar MON | Kontrak | Tidak bisa |

**Sumber kebenaran status lulus adalah kontrak.** Database backend tidak pernah menjadi gerbang pembelian.

## 7. Room dan penonton

- Pemain (host) membuat room dan mendapat **kode 6 karakter** yang berlaku **15 menit** sejak dibuat. Run yang sedang berjalan saat kode kedaluwarsa tetap selesai normal.
- Penonton masuk dengan kode dan nama panggilan opsional, **tanpa wallet dan tanpa biaya**. Maksimal 50 penonton per room.
- Penonton melihat status run (sisa waktu, jumlah mepet, lajur pemain) dan panel gangguan.
- Setiap penonton punya **energi** (maksimal 100, terisi 10 per detik). Biaya energi:
  - Nitro: 30
  - Rantai: 35 (penonton memilih lajur)
  - Red zone 3 dtk: 45 · 5 dtk: 60 · 7 dtk: 80 (penonton memilih satu lajur)
- Gangguan penonton dikirim lewat backend (off-chain). Gangguan itu tetap tercatat di log run yang hash-nya ikut masuk on-chain, jadi bisa diaudit.
- Room **tidak wajib**. Pemain boleh main solo, dan NPC tetap mengganggu.

## 8. Koneksi putus

- **Pemain putus:** game tetap berjalan di browser. Yang aktif hanya lalu lintas dan gangguan NPC. Gangguan penonton yang belum sampai tidak berlaku. Input disimpan dan dikirim ulang saat tersambung kembali, lalu diverifikasi.
- Jika pemain belum tersambung lagi sampai **30 detik setelah run seharusnya selesai**, sisa run yang belum terverifikasi tidak dihitung. Mepet yang sudah terverifikasi sebelumnya tetap berlaku.
- **Penonton putus:** tidak memengaruhi run.

## 9. Kenapa blockchain, dan kenapa Monad

### 9.1 Peran blockchain

- **Gerbang pembelian dicek kontrak.** Kontrak hanya mengizinkan pembelian oleh pemain yang punya catatan lulus on-chain. Backend tidak bisa melewatinya diam-diam: satu-satunya cara adalah memalsukan catatan mepet, dan itu tercatat publik serta bisa ketahuan lewat audit.
- **Bukti skill terlihat publik.** Setiap mepet (run, waktu dalam run, jenis kendaraan) bisa dilihat siapa pun. Setiap NFT menunjuk ke run yang membuktikannya.
- **Bisa diaudit.** Setiap catatan mepet membawa hash log input. Log lengkap dipublikasikan setelah run. Halaman audit menghitung ulang mepet dan mencocokkannya dengan chain.
- **Seed tidak dipilih tim.** Seed lalu lintas diturunkan dari hash blok Monad dan dihitung ulang oleh kontrak.
- **Kelangkaan dijaga kode.** Syarat, harga, dan batas suplai tidak bisa diubah setelah deploy, dan tidak ada fungsi mint oleh admin.

### 9.2 Peran Monad

- Blok ±400 ms dan finality ±800 ms membuat setiap mepet bisa muncul on-chain hampir seketika. Chain berfungsi sebagai **papan skor publik yang live**: penonton, leaderboard, dan aplikasi lain bisa mengikuti run langsung dari chain.
- Backend mengirim **satu transaksi per blok** berisi semua mepet dari semua pemain. Satu run 100 detik setara ±250 blok. Sebagai pagar waktu, kontrak menolak catatan untuk run yang dimulai lebih dari 750 blok (±5 menit) sebelumnya, dan tick run tidak boleh melewati 3.000 (100 detik).
- Di chain dengan blok 12 detik, pencatatan per mepet tidak bisa live. Pilihan yang realistis di sana hanya settlement sekali di akhir run.

### 9.3 Batas kepercayaan (disampaikan jujur saat pitch)

- **Backend adalah wasit.** Kecurangan backend tidak dicegah oleh kode, tapi bisa ketahuan lewat audit.
- Lalu lintas deterministik dari seed, sehingga bot yang sangat baik tetap mungkin. Mitigasi MVP: rate limit, deteksi speedhack, dan batas suplai.
- Langkah berikutnya: input ditandatangani session key pemain, seed bertahap dari blok-blok berikutnya, dan simulasi on-chain.

## 10. Skenario demo saat pitch (3–5 menit)

1. Layar menampilkan kode room dan QR, lalu penonton bergabung lewat HP.
2. Presenter memainkan run. Penonton mengirim nitro, rantai, dan red zone. Panel samping menampilkan setiap mepet yang tercatat on-chain beserta nomor blok dan latensinya.
3. Presenter mencapai syarat Tier 1, dan event `Qualified` muncul.
4. Presenter membeli Tier 1 dengan MON. NFT masuk ke wallet. Lalu coba transfer: gagal karena soulbound.
5. Buka halaman audit run tadi: mepet dihitung ulang dan cocok dengan chain.

**Cadangan:** video rekaman demo, dan akun presenter yang sudah lulus syarat Tier 1 lebih awal di hari H.

## 11. Metrik keberhasilan demo

- Run end-to-end di Monad testnet berjalan tanpa error.
- Median latensi dari mepet terverifikasi sampai tercatat on-chain ≤ 2 detik.
- Minimal 10 penonton berhasil bergabung dan mengirim gangguan.
- Pembelian mobil berhasil, dan transfer NFT ditolak.

## 12. Asumsi yang perlu dikonfirmasi tim

1. **5 aset mobil = 1 Starter + 4 mobil NFT (Tier 1–4).** Jika yang dimaksud 5 mobil NFT ditambah Starter, tambahkan satu baris di §6.
2. **Tabrakan langsung mengakhiri run** (tanpa nyawa).
3. **NPC selalu aktif**, bukan hanya saat tidak ada penonton, supaya syarat mobil adil untuk semua pemain.
4. Lalu lintas berkecepatan seragam (penyederhanaan v1).
5. Koin dikreditkan saat mepet sudah tercatat on-chain.
6. Harga MON dan batas suplai adalah nilai testnet.
7. Nama game: **Racing Gang**.

## 13. Kepatuhan aturan lomba

- Aturan standar Monad Blitz: proyek harus baru, coding dan pembuatan aset dimulai pada jam acara. Riset dan perencanaan sebelumnya diperbolehkan; dokumen ini adalah perencanaan.
- Konfirmasi ke panitia soal menyiapkan aset sebelum hari H. Utamakan aset berlisensi CC0, dan simpan bukti lisensinya.
- Repo publik, dan proyek ter-deploy di Monad testnet.
- Jangan memakai nama, aset, atau UI Racing Limits.

## 14. Roadmap jangka panjang (setelah lomba)

Prinsip: aktivitas on-chain harus datang dari **pemain yang terus kembali**, bukan dari transaksi buatan.

| Fase | Fitur | Peran on-chain |
|---|---|---|
| **1. Lomba (MVP)** | Run, mepet terverifikasi, 4 mobil soulbound, room penonton | Catatan mepet live, gerbang pembelian, NFT soulbound |
| **2. Retensi harian** | **Tantangan harian:** semua pemain melewati jalan yang sama, dengan seed dari hash blok Monad pada jam tertentu | Seed bisa diverifikasi siapa pun; leaderboard harian on-chain |
| | **Ghost race:** tantang hantu dari run terbaik teman atau juara harian | Log input yang hash-nya on-chain diputar ulang |
| | **Odometer mobil:** NFT mengumpulkan statistik seumur hidup (total mepet, mepet truk, red zone yang dilewati); pencapaian membuka kosmetik | Statistik per token di kontrak |
| **3. Musim dan komunitas** | **Season** 4–8 minggu: peta, syarat, set mobil, dan suplai baru; mobil lama diberi label musimnya | Registry baru per musim (syarat tetap immutable) |
| | **Trofi soulbound:** juara harian, lulus Tier 4 di Season 1, selamat dari 3 red zone | Resume skill yang bisa dibaca aplikasi lain |
| | **Crew dan target komunitas:** skor tim mingguan; misalnya "1 juta mepet membuka peta baru" | Progres bersama yang terlihat live |
| **4. Ekosistem** | **Mode streamer:** penonton live YouTube/Twitch mengganggu streamer lewat kode room; lencana "Penjegal terbaik" yang bisa diklaim dengan wallet | Kanal akuisisi; penonton menjadi pemain |
| | **Turnamen bersponsor:** pool hadiah untuk pemuncak leaderboard, dibagi otomatis oleh kontrak | Pembagian hadiah transparan; berbasis skill, bukan taruhan |
| | **Protokol terbuka:** status lulus dan trofi bisa dipakai game atau komunitas lain | Data skill sebagai infrastruktur bersama di Monad |
| | **Mainnet + lencana Pioneer** untuk pemain testnet saat lomba | Kesinambungan pengguna awal |

Keberlanjutan biaya:
- Pencatatan per mepet hanya untuk run ranked dan tantangan harian; run santai cukup dicatat ringkasannya.
- Sponsor turnamen atau musim ikut menanggung gas.

Batasan yang dijaga: tidak ada taruhan pada hasil run, dan tidak ada token yang bisa diperdagangkan.

**Untuk pitch**, cukup sebut tiga hal: tantangan harian dengan seed dari blok Monad, season, dan mode streamer.

## 15. Glosarium

| Istilah | Arti |
|---|---|
| Run | Satu kali permainan, maksimal 100 detik |
| Mepet | Near-miss yang memenuhi §5.3 |
| Tick | Satuan waktu simulasi; 30 tick = 1 detik |
| Seed | Angka acak run yang menentukan lalu lintas dan gangguan NPC |
| Attester | Wallet backend yang berhak mencatat run dan mepet ke kontrak |
| Voucher | Tanda tangan backend yang menyatakan koin pemain sudah disisihkan untuk pembelian |
| Soulbound | NFT yang tidak bisa dipindahkan |
| Rantai | Gangguan yang memperlambat; di kode disebut `SPIKES` agar tidak tertukar dengan "chain" (blockchain) |
