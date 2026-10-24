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
| RunRegistry | `0x5DF0f8c94BdcAeCAe74C3db606FfcE9EC09cBD93` | [MonadVision](https://testnet.monadvision.com/address/0x5df0f8c94bdcaecae74c3db606ffce9ec09cbd93) · [Monadscan](https://testnet.monadscan.com/address/0x5df0f8c94bdcaecae74c3db606ffce9ec09cbd93) |
| CarNFT | `0x6Ac0e6D8e71D36fF31C61F391a4a7CFE2843654b` | [MonadVision](https://testnet.monadvision.com/address/0x6ac0e6d8e71d36ff31c61f391a4a7cfe2843654b) · [Monadscan](https://testnet.monadscan.com/address/0x6ac0e6d8e71d36ff31c61f391a4a7cfe2843654b) |

Deploy 2026-10-23, blok `73297824`, config versi 1, kedua kontrak terverifikasi. Owner = deployer
`0xCca8…5be5`, attester `0x1E15…ca9B`, voucher signer `0x4323…a256`, treasury `0x6c87…1046`.
`baseURI` masih kosong: diisi lewat `setBaseURI` setelah metadata mobil siap (lihat di bawah).
Gas deploy: RunRegistry 1,41 jt, CarNFT 2,55 jt, `setCarNFT` 56 rb (total ±0,41 MON).

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

  Angka nyata di testnet diukur ulang setelah deploy (SC-6).
