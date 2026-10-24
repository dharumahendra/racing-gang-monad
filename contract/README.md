# contract — Racing Gang

Foundry + OpenZeppelin v5 (bukan workspace pnpm). Spesifikasi: `.context/TECH_SPEC.md` §6, tugas: `.context/TASKS.md` §3.

| File | Isi |
|---|---|
| `src/RunRegistry.sol` | Catatan run, mepet, dan kelulusan tier (§6.1) |
| `src/CarNFT.sol` | NFT mobil soulbound, `buy()` dengan voucher EIP-712 (§6.2–6.3) |
| `script/Deploy.s.sol` | Deploy + `setCarNFT` (§6.4 langkah 1–3) |
| `script/export-deployment.mjs` | Tulis alamat + ABI ke `packages/config/deployments` (§6.4 langkah 5) |
| `config/cars.json` | Angka mobil hasil `pnpm config:export`; **jangan diedit manual** (CI mengecek sinkron) |

## Setup

```bash
# dari root repo, sekali saja setelah clone
git submodule update --init --recursive contract/lib/forge-std contract/lib/openzeppelin-contracts

cd contract
forge build
forge test
```

Versi terkunci: solc 0.8.30 (EVM `prague`), forge-std v1.17.0, OpenZeppelin v5.7.0 (submodule).
CI menjalankan `forge fmt --check`, jadi jalankan `forge fmt` sebelum commit.

## Deployment aktif (Monad testnet)

| Kontrak | Alamat | Explorer |
|---|---|---|
| RunRegistry | `0xE3c8EDd37798d5e03553E4F6Df191bC8586AdaCA` | [MonadVision](https://testnet.monadvision.com/address/0xe3c8edd37798d5e03553e4f6df191bc8586adaca) · [Monadscan](https://testnet.monadscan.com/address/0xe3c8edd37798d5e03553e4f6df191bc8586adaca) |
| CarNFT | `0xD8A134916c85ACE413289eaF674aEDCd984BA736` | [MonadVision](https://testnet.monadvision.com/address/0xd8a134916c85ace413289eaf674aedcd984ba736) · [Monadscan](https://testnet.monadscan.com/address/0xd8a134916c85ace413289eaf674aedcd984ba736) |

Deploy 2026-10-24, blok `73733089`, kedua kontrak terverifikasi. Sudah memakai optimasi gas RunRegistry. Di-deploy dengan
`cars.json` config versi 2; syarat, harga, dan suplai sama persis dengan config versi 3 (perubahan v3 hanya di sim),
jadi tidak perlu deploy ulang.
Owner = deployer `0xa046…6F80`, attester `0xf124…c2c0`, voucher signer `0xf93d…2e1F`, treasury `0x6c87…1046`.
`baseURI` masih kosong: diisi lewat `setBaseURI` setelah metadata mobil di-hosting (lihat di bawah).

Deployment lama (2026-10-23, RunRegistry `0x5DF0…BD93`, CarNFT `0x6Ac0…654b`) tidak dipakai lagi: wallet-nya
diganti karena key lama pernah tertulis di chat.

## Koleksi tambahan (`Collectibles`, RGX)

Kontrak terpisah dari CarNFT: kosmetik tanpa efek gameplay. `buy(uint8 design)` dibayar MON (`msg.value == price(design)`),
1 per desain per wallet, soulbound (ERC-5192). Harga dan suplai dari `COLLECTIBLES` di `packages/config`
(`contract/config/collectibles.json`), immutable setelah deploy. Tidak ada mint admin.

| Desain | Nama | Harga | Suplai |
|---|---|---|---|
| 1 | Mine Cart | 0,05 MON | 100 |
| 2 | Burger Car | 0,05 MON | 100 |
| 3 | Boat Car | 0,05 MON | 100 |

Alamat `0x364A20CAFb328028E125d846431cfc7b0391F42d` ([MonadVision](https://testnet.monadvision.com/address/0x364a20cafb328028e125d846431cfc7b0391f42d)),
blok `73777102`, terverifikasi. Owner = deployer `0xa046…6F80`. `tokenURI` = `baseURI + design + ".json"` dengan
baseURI `https://racing-gang-monad.vercel.app/collectibles/metadata/`. Alamat dan ABI: `packages/config/deployments/collectibles-monad-testnet.json`
(`getCollectiblesDeployment()`).

```bash
forge script script/DeployCollectibles.s.sol --rpc-url monad_testnet --broadcast   # COLLECTIBLES_BASE_URI dari .env
node script/export-collectibles.mjs 10143 https://testnet.monadvision.com
```

## Deploy ke Monad testnet

Butuh: wallet deployer berisi MON, alamat attester dan voucher signer (harus berbeda).

```bash
cd contract
cp .env.example .env         # isi DEPLOYER_PRIVATE_KEY, ATTESTER_ADDRESS, VOUCHER_SIGNER_ADDRESS, NFT_BASE_URI
source .env

forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
node script/export-deployment.mjs 10143 <explorerUrl>   # → packages/config/deployments/monad-testnet.json
```

Lalu verifikasi kedua kontrak lewat API verifikasi Monad (MonadVision, Socialscan, Monadscan sekaligus):

```bash
forge verify-contract <ADDR> src/RunRegistry.sol:RunRegistry --chain 10143 --show-standard-json-input > /tmp/std.json
# POST https://agents.devnads.com/v1/verify dengan chainId, contractAddress, contractName,
# compilerVersion (v0.8.30+commit...), standardJsonInput, foundryMetadata (out/<C>.sol/<C>.json .metadata),
# constructorArgs (ABI-encoded tanpa 0x)
```

Cadangan kalau API gagal:
`forge verify-contract <ADDR> <path:Contract> --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/`

Setelah deploy, isi `RUN_REGISTRY_ADDRESS` dan `CAR_NFT_ADDRESS` di env backend lalu set `CHAIN_MODE=live`.

## Metadata NFT

`tokenURI(id)` = `baseURI + tier + ".json"`, jadi cukup host 4 file: `1.json` … `4.json` (format metadata
ERC-721: `name`, `description`, `image`, `attributes`). Setelah file bisa diakses publik:

```bash
cast send <CAR_NFT> "setBaseURI(string)" "https://<host>/cars/" --rpc-url monad_testnet --private-key $DEPLOYER_PRIVATE_KEY
```

`setBaseURI` meng-emit `BatchMetadataUpdate` (ERC-4906) supaya wallet/explorer memuat ulang metadata token
yang sudah terjual. Syarat, harga, dan suplai tetap immutable.

## Uji lokal dengan anvil

```bash
anvil --block-time 1
# terminal lain, dari contract/ — kunci di bawah adalah akun bawaan anvil (publik, hanya untuk lokal)
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
ATTESTER_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
VOUCHER_SIGNER_ADDRESS=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
forge script script/Deploy.s.sol --rpc-url localhost --broadcast
node script/export-deployment.mjs 31337                  # → out/deployment-31337.json (tidak di-commit)
```

Backend bisa dijalankan dengan `CHAIN_MODE=live`, `CHAIN_ID=31337`, `MONAD_RPC_URL=http://127.0.0.1:8545`,
`MONAD_WS_URL=ws://127.0.0.1:8545`, kunci attester/voucher anvil (akun #1 dan #2), dan alamat dari output deploy.
Test integrasi `backend/test/live-anvil.test.ts` menjalankan anvil sendiri (butuh `forge build` lebih dulu).

## Monad

- Chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`.
- Gas ditagih berdasarkan **gas limit**, jadi relayer memakai `estimasi × 1,1`.
- Wallet attester harus bersaldo **> 10 MON** (reserve balance). Di bawah itu akun hanya boleh mengirim
  1 transaksi per 3 blok dan latensi mepet on-chain akan molor.
- Gas `submitBatch` (`forge test --isolate --match-contract RunRegistryGas -vv`, tiap panggilan = transaksi
  terpisah dengan slot dingin). Kolom Monad = gas EVM + 6.000 per slot unik (selisih akses dingin Monad):

  | Isi transaksi | Gas EVM | Perkiraan Monad | Sebelum optimasi (Monad) |
  |---|---|---|---|
  | start run | 76,4 rb | ±94 rb | ±123 rb |
  | 1 mepet | 39,2 rb | ±51 rb | ±69 rb |
  | 5 mepet | 76,4 rb | ±88 rb | ±112 rb |
  | 1 mepet + lulus tier | 88,4 rb | ±112 rb | ±120 rb |
  | end run | 35,3 rb | ±47 rb | ±48 rb |

  Terukur di Monad testnet (`eth_estimateGas` dari attester): start run **84,2 rb** di kontrak baru vs 101,7 rb
  di kontrak lama (−17%). Mepet butuh run yang sudah berjalan, jadi diukur dari transaksi relayer saat tes live (SC-6).
