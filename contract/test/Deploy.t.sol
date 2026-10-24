// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {RunRegistry} from "../src/RunRegistry.sol";
import {CarNFT} from "../src/CarNFT.sol";
import {CarsConfig} from "../script/CarsConfig.sol";

contract DeployTest is Test {
    address attester = makeAddr("attester");
    address voucherSigner = makeAddr("voucherSigner");
    uint256 deployerKey;

    function setUp() public {
        (, deployerKey) = makeAddrAndKey("deployer");
    }

    /// Satu-satunya test yang memakai env: vm.setEnv berlaku global dan test berjalan paralel.
    function test_RunReadsEnvAndWiresContracts() public {
        vm.setEnv("DEPLOYER_PRIVATE_KEY", vm.toString(deployerKey));
        vm.setEnv("ATTESTER_ADDRESS", vm.toString(attester));
        vm.setEnv("VOUCHER_SIGNER_ADDRESS", vm.toString(voucherSigner));
        vm.setEnv("NFT_BASE_URI", "https://racing.gang/cars/");

        (RunRegistry registry, CarNFT nft) = new Deploy().run();
        CarsConfig.Cars memory cars = CarsConfig.load();

        assertEq(registry.attester(), attester);
        assertEq(registry.owner(), vm.addr(deployerKey));
        assertEq(address(registry.carNFT()), address(nft));
        assertEq(address(nft.registry()), address(registry));
        assertEq(nft.voucherSigner(), voucherSigner);
        for (uint8 t = 1; t <= 4; t++) {
            assertEq(registry.reqNearMiss(t), cars.reqNearMiss[t]);
            assertEq(registry.minCarTier(t), cars.minCarTier[t]);
            assertEq(nft.price(t), cars.priceWei[t]);
            assertEq(nft.supply(t), cars.supply[t]);
        }
    }

    function test_RevertWhen_AttesterEqualsVoucherSigner() public {
        Deploy d = new Deploy();
        vm.expectRevert("Deploy: attester dan voucher signer harus berbeda");
        d.deploy(Deploy.Params(deployerKey, attester, attester, ""));
    }

    function test_RevertWhen_AddressZero() public {
        Deploy d = new Deploy();
        vm.expectRevert("Deploy: alamat kosong");
        d.deploy(Deploy.Params(deployerKey, address(0), voucherSigner, ""));
    }
}
