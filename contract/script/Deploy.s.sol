// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {RunRegistry} from "../src/RunRegistry.sol";
import {CarNFT} from "../src/CarNFT.sol";
import {CarsConfig} from "./CarsConfig.sol";

/// @notice Deploy RunRegistry + CarNFT dan sambungkan keduanya (TECH_SPEC §6.4 langkah 1–3).
///         Angka syarat, harga, dan suplai dibaca dari `config/cars.json`.
///         Setelah broadcast, jalankan `node script/export-deployment.mjs <chainId>` untuk menulis
///         alamat dan ABI ke `packages/config/deployments/`.
contract Deploy is Script {
    struct Params {
        uint256 deployerKey;
        address attester;
        address voucherSigner;
        string baseURI;
    }

    function run() external returns (RunRegistry, CarNFT) {
        return deploy(
            Params({
                deployerKey: vm.envUint("DEPLOYER_PRIVATE_KEY"),
                attester: vm.envAddress("ATTESTER_ADDRESS"),
                voucherSigner: vm.envAddress("VOUCHER_SIGNER_ADDRESS"),
                baseURI: vm.envOr("NFT_BASE_URI", string(""))
            })
        );
    }

    function deploy(Params memory p) public returns (RunRegistry registry, CarNFT nft) {
        CarsConfig.Cars memory cars = CarsConfig.load();
        require(p.attester != address(0) && p.voucherSigner != address(0), "Deploy: alamat kosong");
        // TECH_SPEC §6.3: kunci voucher signer berbeda dari kunci attester.
        require(p.attester != p.voucherSigner, "Deploy: attester dan voucher signer harus berbeda");

        vm.startBroadcast(p.deployerKey);
        registry = new RunRegistry(p.attester, cars.reqNearMiss, cars.minCarTier);
        nft = new CarNFT(address(registry), p.voucherSigner, cars.priceWei, cars.supply, p.baseURI);
        registry.setCarNFT(address(nft));
        vm.stopBroadcast();

        console.log("configVersion ", cars.configVersion);
        console.log("RunRegistry   ", address(registry));
        console.log("CarNFT        ", address(nft));
        console.log("attester      ", p.attester);
        console.log("voucherSigner ", p.voucherSigner);
    }
}
