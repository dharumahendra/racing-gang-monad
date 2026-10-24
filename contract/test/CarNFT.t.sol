// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {CarNFT} from "../src/CarNFT.sol";
import {RunRegistry} from "../src/RunRegistry.sol";
import {IERC5192} from "../src/interfaces/IERC5192.sol";
import {CarsConfig} from "../script/CarsConfig.sol";

contract CarNFTTest is Test {
    RunRegistry reg;
    CarNFT nft;
    CarsConfig.Cars cars;

    address attester = makeAddr("attester");
    address player = makeAddr("player");
    address other = makeAddr("other");
    address treasury = makeAddr("treasury");
    address signer;
    uint256 signerKey;

    uint64 constant SEED_BLOCK = 100;
    bytes32 constant RUN = keccak256("run-player");
    bytes32 constant RUN_OTHER = keccak256("run-other");
    string constant BASE_URI = "https://racing.gang/cars/";

    function setUp() public {
        (signer, signerKey) = makeAddrAndKey("voucherSigner");
        cars = CarsConfig.load();

        reg = new RunRegistry(attester, cars.reqNearMiss, cars.minCarTier);
        nft = new CarNFT(address(reg), signer, cars.priceWei, cars.supply, BASE_URI);
        reg.setCarNFT(address(nft));

        vm.roll(SEED_BLOCK + 3);
        vm.setBlockhash(SEED_BLOCK, keccak256("seed"));
        vm.warp(1_000_000);

        _qualify(reg, player, RUN, 40); // lulus Tier 1
        vm.deal(player, 10 ether);
        vm.deal(other, 10 ether);
    }

    // ------------------------------------------------------------ helpers

    /// Catat run Starter dengan `count` mepet untuk `who`.
    function _qualify(RunRegistry r, address who, bytes32 runId, uint16 count) internal {
        RunRegistry.StartRec[] memory s = new RunRegistry.StartRec[](1);
        s[0] = RunRegistry.StartRec(runId, who, 0, SEED_BLOCK, 1);
        RunRegistry.NearMissRec[] memory n = new RunRegistry.NearMissRec[](count);
        for (uint16 i = 1; i <= count; i++) {
            n[i - 1] = RunRegistry.NearMissRec(runId, i, i, 0, i, bytes32(0));
        }
        vm.prank(attester);
        r.submitBatch(s, n, new RunRegistry.EndRec[](0));
    }

    function _voucher(address buyer, uint8 tier, uint256 nonce) internal view returns (CarNFT.Voucher memory) {
        return CarNFT.Voucher(buyer, tier, 3000, nonce, uint64(block.timestamp + 600));
    }

    function _sign(CarNFT n, CarNFT.Voucher memory v, uint256 key) internal view returns (bytes memory) {
        (uint8 sv, bytes32 r, bytes32 s) = vm.sign(key, n.voucherDigest(v));
        return abi.encodePacked(r, s, sv);
    }

    function _buy(address buyer, CarNFT.Voucher memory v, uint256 value) internal {
        bytes memory sig = _sign(nft, v, signerKey);
        vm.prank(buyer);
        nft.buy{value: value}(v, sig);
    }

    /// Tanda tangan dibuat dulu supaya expectRevert menangkap `buy`, bukan `voucherDigest`.
    function _buyExpectRevert(address buyer, CarNFT.Voucher memory v, uint256 value, bytes4 err) internal {
        bytes memory sig = _sign(nft, v, signerKey);
        vm.prank(buyer);
        vm.expectRevert(err);
        nft.buy{value: value}(v, sig);
    }

    function _buyTier1() internal returns (uint256 tokenId) {
        _buy(player, _voucher(player, 1, 1), cars.priceWei[1]);
        return 1;
    }

    // ------------------------------------------------------------ config

    function test_Metadata() public view {
        assertEq(nft.name(), "Racing Gang Cars");
        assertEq(nft.symbol(), "RGC");
        assertEq(address(nft.registry()), address(reg));
        assertEq(nft.voucherSigner(), signer);
        for (uint8 t = 1; t <= 4; t++) {
            assertEq(nft.price(t), cars.priceWei[t]);
            assertEq(nft.supply(t), cars.supply[t]);
        }
        assertEq(nft.price(0), 0);
        assertEq(nft.supply(5), 0);
    }

    function test_RevertWhen_InvalidConfig() public {
        uint256[5] memory supply = cars.supply;
        supply[3] = 0;
        vm.expectRevert(CarNFT.InvalidConfig.selector);
        new CarNFT(address(reg), signer, cars.priceWei, supply, BASE_URI);

        vm.expectRevert(CarNFT.InvalidConfig.selector);
        new CarNFT(address(0), signer, cars.priceWei, cars.supply, BASE_URI);
    }

    /// Mengunci domain EIP-712 supaya voucher dari backend (viem signTypedData) cocok.
    function test_VoucherDigestMatchesEIP712Spec() public view {
        CarNFT.Voucher memory v = _voucher(player, 1, 42);
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("RacingGangCars"),
                keccak256("1"),
                block.chainid,
                address(nft)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Voucher(address buyer,uint8 tier,uint32 coinCost,uint256 nonce,uint64 expiry)"),
                v.buyer,
                v.tier,
                v.coinCost,
                v.nonce,
                v.expiry
            )
        );
        assertEq(nft.voucherDigest(v), keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
    }

    // ------------------------------------------------------------ buy

    function test_Buy() public {
        CarNFT.Voucher memory v = _voucher(player, 1, 7);

        vm.expectEmit(address(nft));
        emit IERC5192.Locked(1);
        vm.expectEmit(address(nft));
        emit CarNFT.Purchased(player, 1, 1, 7, v.coinCost, RUN);
        _buy(player, v, cars.priceWei[1]);

        assertEq(nft.ownerOf(1), player);
        assertEq(nft.balanceOf(player), 1);
        assertEq(nft.tokenTier(1), 1);
        assertEq(nft.tokenRun(1), RUN);
        assertEq(nft.minted(1), 1);
        assertTrue(nft.ownsTier(player, 1));
        assertFalse(nft.ownsTier(player, 2));
        assertTrue(nft.voucherUsed(7));
        assertEq(address(nft).balance, cars.priceWei[1]);
        assertTrue(nft.locked(1));
    }

    function test_RevertWhen_NotQualified() public {
        _buyExpectRevert(other, _voucher(other, 1, 1), cars.priceWei[1], CarNFT.NotQualified.selector);

        _buyExpectRevert(player, _voucher(player, 2, 2), cars.priceWei[2], CarNFT.NotQualified.selector);
    }

    function test_RevertWhen_WrongPrice() public {
        CarNFT.Voucher memory v = _voucher(player, 1, 1);
        _buyExpectRevert(player, v, cars.priceWei[1] - 1, CarNFT.WrongPrice.selector);

        _buyExpectRevert(player, v, cars.priceWei[1] + 1, CarNFT.WrongPrice.selector);
    }

    function test_RevertWhen_SoldOut() public {
        uint256[5] memory supply = cars.supply;
        supply[1] = 1;
        RunRegistry r = new RunRegistry(attester, cars.reqNearMiss, cars.minCarTier);
        CarNFT n = new CarNFT(address(r), signer, cars.priceWei, supply, BASE_URI);
        r.setCarNFT(address(n));
        _qualify(r, player, RUN, 40);
        _qualify(r, other, RUN_OTHER, 40);

        CarNFT.Voucher memory v1 = _voucher(player, 1, 1);
        bytes memory s1 = _sign(n, v1, signerKey);
        vm.prank(player);
        n.buy{value: cars.priceWei[1]}(v1, s1);

        CarNFT.Voucher memory v2 = _voucher(other, 1, 2);
        bytes memory s2 = _sign(n, v2, signerKey);
        vm.prank(other);
        vm.expectRevert(CarNFT.SoldOut.selector);
        n.buy{value: cars.priceWei[1]}(v2, s2);
    }

    function test_RevertWhen_AlreadyOwned() public {
        _buyTier1();
        _buyExpectRevert(player, _voucher(player, 1, 2), cars.priceWei[1], CarNFT.AlreadyOwned.selector);
    }

    function test_RevertWhen_VoucherExpired() public {
        CarNFT.Voucher memory v = _voucher(player, 1, 1);
        bytes memory sig = _sign(nft, v, signerKey);
        vm.warp(v.expiry + 1);
        vm.prank(player);
        vm.expectRevert(CarNFT.VoucherExpired.selector);
        nft.buy{value: cars.priceWei[1]}(v, sig);
    }

    function test_BuyAtExactExpiry() public {
        CarNFT.Voucher memory v = _voucher(player, 1, 1);
        bytes memory sig = _sign(nft, v, signerKey);
        vm.warp(v.expiry);
        vm.prank(player);
        nft.buy{value: cars.priceWei[1]}(v, sig);
    }

    function test_RevertWhen_VoucherReused() public {
        _buyTier1(); // nonce 1
        _buyExpectRevert(player, _voucher(player, 1, 1), cars.priceWei[1], CarNFT.VoucherUsed.selector);
    }

    function test_RevertWhen_BadSignature() public {
        CarNFT.Voucher memory v = _voucher(player, 1, 1);
        (, uint256 wrongKey) = makeAddrAndKey("wrong");
        bytes memory sig = _sign(nft, v, wrongKey);
        vm.prank(player);
        vm.expectRevert(CarNFT.BadSignature.selector);
        nft.buy{value: cars.priceWei[1]}(v, sig);

        vm.prank(player);
        vm.expectRevert(CarNFT.BadSignature.selector);
        nft.buy{value: cars.priceWei[1]}(v, hex"1234");
    }

    function test_RevertWhen_VoucherFieldTampered() public {
        CarNFT.Voucher memory v = _voucher(player, 1, 1);
        bytes memory sig = _sign(nft, v, signerKey);
        v.coinCost = 1; // koin dipotong lebih kecil dari yang ditandatangani
        vm.prank(player);
        vm.expectRevert(CarNFT.BadSignature.selector);
        nft.buy{value: cars.priceWei[1]}(v, sig);
    }

    function test_RevertWhen_WrongBuyer() public {
        CarNFT.Voucher memory v = _voucher(player, 1, 1);
        bytes memory sig = _sign(nft, v, signerKey);
        vm.prank(other);
        vm.expectRevert(CarNFT.WrongBuyer.selector);
        nft.buy{value: cars.priceWei[1]}(v, sig);
    }

    function test_RevertWhen_BadTier() public {
        _buyExpectRevert(player, _voucher(player, 0, 1), 0, CarNFT.BadTier.selector);

        _buyExpectRevert(player, _voucher(player, 5, 2), 0, CarNFT.BadTier.selector);
    }

    function test_SetVoucherSigner() public {
        (address next,) = makeAddrAndKey("nextSigner");
        nft.setVoucherSigner(next);
        assertEq(nft.voucherSigner(), next);

        _buyExpectRevert(player, _voucher(player, 1, 1), cars.priceWei[1], CarNFT.BadSignature.selector); // ditandatangani signer lama
    }

    function test_RevertWhen_NonOwnerSetsVoucherSigner() public {
        vm.prank(player);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, player));
        nft.setVoucherSigner(player);
    }

    // ------------------------------------------------------------ soulbound

    function test_RevertWhen_Transfer() public {
        uint256 id = _buyTier1();

        vm.startPrank(player);
        vm.expectRevert(CarNFT.Soulbound.selector);
        nft.transferFrom(player, other, id);

        vm.expectRevert(CarNFT.Soulbound.selector);
        nft.safeTransferFrom(player, other, id);

        vm.expectRevert(CarNFT.Soulbound.selector);
        nft.safeTransferFrom(player, other, id, "");
        vm.stopPrank();

        assertEq(nft.ownerOf(id), player);
    }

    function test_RevertWhen_Approve() public {
        uint256 id = _buyTier1();
        vm.startPrank(player);
        vm.expectRevert(CarNFT.Soulbound.selector);
        nft.approve(other, id);

        vm.expectRevert(CarNFT.Soulbound.selector);
        nft.setApprovalForAll(other, true);
        vm.stopPrank();
    }

    function test_LockedRevertsForUnknownToken() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 99));
        nft.locked(99);
    }

    function test_SupportsInterface() public view {
        assertEq(type(IERC5192).interfaceId, bytes4(0xb45a3c0e));
        assertTrue(nft.supportsInterface(0xb45a3c0e)); // IERC5192
        assertTrue(nft.supportsInterface(0x80ac58cd)); // IERC721
        assertTrue(nft.supportsInterface(0x5b5e139f)); // IERC721Metadata
        assertTrue(nft.supportsInterface(0x49064906)); // IERC4906
        assertFalse(nft.supportsInterface(0xffffffff));
    }

    function test_TokenURI() public {
        uint256 id = _buyTier1();
        assertEq(nft.tokenURI(id), string.concat(BASE_URI, "1.json"));
    }

    function test_SetBaseURI_UpdatesExistingTokens() public {
        uint256 id = _buyTier1();
        vm.expectEmit(address(nft));
        emit CarNFT.BatchMetadataUpdate(1, type(uint256).max);
        nft.setBaseURI("ipfs://cid/");
        assertEq(nft.tokenURI(id), "ipfs://cid/1.json");
    }

    function test_RevertWhen_NonOwnerSetsBaseURI() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        nft.setBaseURI("https://evil/");
    }

    // ------------------------------------------------------------ treasury

    function test_Withdraw() public {
        _buyTier1();
        nft.withdraw(payable(treasury));
        assertEq(treasury.balance, cars.priceWei[1]);
        assertEq(address(nft).balance, 0);
    }

    function test_RevertWhen_NonOwnerWithdraws() public {
        _buyTier1();
        vm.prank(player);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, player));
        nft.withdraw(payable(player));
    }

    // ------------------------------------------------------------ integrasi

    /// Lulus Tier 1 → beli → main dengan Tier 1 → lulus Tier 2 → beli Tier 2.
    function test_ProgressionTier1ToTier2() public {
        _buyTier1();

        RunRegistry.StartRec[] memory s = new RunRegistry.StartRec[](1);
        s[0] = RunRegistry.StartRec(RUN_OTHER, player, 1, SEED_BLOCK, 1);
        RunRegistry.NearMissRec[] memory n = new RunRegistry.NearMissRec[](75);
        for (uint16 i = 1; i <= 75; i++) {
            n[i - 1] = RunRegistry.NearMissRec(RUN_OTHER, i, i, 0, i, bytes32(0));
        }
        vm.prank(attester);
        reg.submitBatch(s, n, new RunRegistry.EndRec[](0));
        assertTrue(reg.isQualified(player, 2));

        _buy(player, _voucher(player, 2, 2), cars.priceWei[2]);
        assertTrue(nft.ownsTier(player, 2));
        assertEq(nft.tokenRun(2), RUN_OTHER);
    }
}
