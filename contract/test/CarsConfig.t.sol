// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CarsConfig} from "../script/CarsConfig.sol";

/// Menguji pembacaan `config/cars.json` asli. Angka acuannya PRD §6.2; kalau angka di
/// packages/config diubah dengan sengaja, test ini ikut diperbarui.
contract CarsConfigTest is Test {
    function test_LoadCarsJson() public view {
        CarsConfig.Cars memory c = CarsConfig.load();

        assertEq(c.configVersion, 1);

        assertEq(c.reqNearMiss[0], 0);
        assertEq(c.reqNearMiss[1], 40);
        assertEq(c.reqNearMiss[2], 75);
        assertEq(c.reqNearMiss[3], 110);
        assertEq(c.reqNearMiss[4], 150);

        assertEq(c.minCarTier[1], 0);
        assertEq(c.minCarTier[4], 3);

        assertEq(c.priceWei[0], 0);
        assertEq(c.priceWei[1], 0.05 ether);
        assertEq(c.priceWei[4], 0.5 ether);

        assertEq(c.supply[0], 0);
        assertEq(c.supply[1], 1000);
        assertEq(c.supply[4], 30);
    }

    function test_TiersAreProgressive() public view {
        CarsConfig.Cars memory c = CarsConfig.load();
        for (uint256 t = 2; t < CarsConfig.TIERS; t++) {
            assertGt(c.reqNearMiss[t], c.reqNearMiss[t - 1]);
            assertEq(c.minCarTier[t], t - 1);
            assertGt(c.priceWei[t], c.priceWei[t - 1]);
            assertLt(c.supply[t], c.supply[t - 1]);
        }
    }
}
