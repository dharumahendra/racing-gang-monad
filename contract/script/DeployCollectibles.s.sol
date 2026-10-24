// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Collectibles} from "../src/Collectibles.sol";
import {CollectiblesConfig} from "./CollectiblesConfig.sol";

/// @notice Deploy koleksi tambahan (terpisah dari RunRegistry/CarNFT). Harga dan suplai dibaca dari
///         `config/collectibles.json`. Setelah broadcast, jalankan `node script/export-collectibles.mjs <chainId>`.
contract DeployCollectibles is Script {
    function run() external returns (Collectibles) {
        return deploy(vm.envUint("DEPLOYER_PRIVATE_KEY"), vm.envOr("COLLECTIBLES_BASE_URI", string("")));
    }

    function deploy(uint256 deployerKey, string memory baseURI) public returns (Collectibles c) {
        CollectiblesConfig.Collectibles memory cfg = CollectiblesConfig.load();

        vm.startBroadcast(deployerKey);
        c = new Collectibles(cfg.priceWei, cfg.supply, baseURI);
        vm.stopBroadcast();

        console.log("Collectibles", address(c));
        console.log("baseURI      ", baseURI);
    }
}
