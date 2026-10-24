// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";

/// @notice Membaca harga dan suplai koleksi dari `config/collectibles.json`, hasil `pnpm config:export`
///         dari `COLLECTIBLES` di `packages/config`.
/// @dev Index array = id desain; index 0 kosong. `priceWei` berupa string desimal supaya presisi tetap.
library CollectiblesConfig {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant SLOTS = 4;
    string internal constant DEFAULT_PATH = "config/collectibles.json";

    struct Collectibles {
        uint256[SLOTS] priceWei;
        uint256[SLOTS] supply;
    }

    function load() internal view returns (Collectibles memory) {
        return load(DEFAULT_PATH);
    }

    function load(string memory file) internal view returns (Collectibles memory c) {
        string memory json = vm.readFile(file);
        uint256[] memory price = vm.parseJsonUintArray(json, ".priceWei");
        uint256[] memory supply = vm.parseJsonUintArray(json, ".supply");
        require(price.length == SLOTS && supply.length == SLOTS, "CollectiblesConfig: harus berisi 3 desain");
        for (uint256 d; d < SLOTS; d++) {
            c.priceWei[d] = price[d];
            c.supply[d] = supply[d];
        }
    }
}
