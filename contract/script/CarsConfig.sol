// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";

/// @notice Membaca angka mobil dari `config/cars.json`, hasil `pnpm config:export` dari `packages/config`
///         (TECH_SPEC §2.2, §6.4), supaya angka di kontrak selalu sama dengan angka di game.
/// @dev Index array = tier. Tier 0 (Starter) bukan NFT; supply 0 = tak terbatas.
///      `priceWei` berupa string desimal supaya tidak kehilangan presisi di JSON.
library CarsConfig {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant TIERS = 5;
    string internal constant DEFAULT_PATH = "config/cars.json";

    struct Cars {
        uint256 configVersion;
        uint16[TIERS] reqNearMiss;
        uint8[TIERS] minCarTier;
        uint256[TIERS] priceWei;
        uint256[TIERS] supply;
    }

    function load() internal view returns (Cars memory) {
        return load(DEFAULT_PATH);
    }

    function load(string memory file) internal view returns (Cars memory c) {
        string memory json = vm.readFile(file);
        c.configVersion = vm.parseJsonUint(json, ".configVersion");
        uint256[] memory req = _array(json, ".reqNearMiss");
        uint256[] memory minTier = _array(json, ".minCarTier");
        uint256[] memory price = _array(json, ".priceWei");
        uint256[] memory supply = _array(json, ".supply");
        for (uint256 t; t < TIERS; t++) {
            require(req[t] <= type(uint16).max, "CarsConfig: reqNearMiss di luar batas");
            require(minTier[t] < TIERS, "CarsConfig: minCarTier di luar batas");
            // forge-lint: disable-next-line(unsafe-typecast) sudah dicek di atas
            c.reqNearMiss[t] = uint16(req[t]);
            // forge-lint: disable-next-line(unsafe-typecast) sudah dicek di atas
            c.minCarTier[t] = uint8(minTier[t]);
            c.priceWei[t] = price[t];
            c.supply[t] = supply[t];
        }
    }

    function _array(string memory json, string memory key) private pure returns (uint256[] memory a) {
        a = vm.parseJsonUintArray(json, key);
        require(a.length == TIERS, string.concat("CarsConfig: ", key, " harus berisi 5 tier"));
    }
}
