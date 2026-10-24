// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Collectibles} from "../src/Collectibles.sol";
import {IERC5192} from "../src/interfaces/IERC5192.sol";
import {CollectiblesConfig} from "../script/CollectiblesConfig.sol";
import {DeployCollectibles} from "../script/DeployCollectibles.s.sol";

contract CollectiblesTest is Test {
    Collectibles col;
    CollectiblesConfig.Collectibles cfg;

    address player = makeAddr("player");
    address other = makeAddr("other");
    address treasury = makeAddr("treasury");
    string constant BASE_URI = "https://racing.gang/collectibles/metadata/";

    function setUp() public {
        cfg = CollectiblesConfig.load();
        col = new Collectibles(cfg.priceWei, cfg.supply, BASE_URI);
        vm.deal(player, 10 ether);
        vm.deal(other, 10 ether);
    }

    /// Harga dibaca sebelum prank: panggilan `price()` setelah `vm.prank` akan memakai prank-nya.
    function _buy(address who, uint8 design) internal returns (uint256 id) {
        uint256 value = col.price(design);
        vm.prank(who);
        col.buy{value: value}(design);
        id = col.minted(1) + col.minted(2) + col.minted(3); // token id berurutan mulai 1
    }

    // ------------------------------------------------------------ config

    function test_ConfigMatchesPackagesConfig() public view {
        for (uint8 d = 1; d <= 3; d++) {
            assertEq(cfg.priceWei[d], 0.05 ether);
            assertEq(cfg.supply[d], 100);
            assertEq(col.price(d), 0.05 ether);
            assertEq(col.supply(d), 100);
        }
        assertEq(col.price(0), 0);
        assertEq(col.supply(4), 0);
    }

    function test_RevertWhen_SupplyZero() public {
        uint256[4] memory supply = cfg.supply;
        supply[2] = 0;
        vm.expectRevert(Collectibles.InvalidConfig.selector);
        new Collectibles(cfg.priceWei, supply, BASE_URI);
    }

    // ------------------------------------------------------------ beli

    function test_BuyEachDesign() public {
        for (uint8 d = 1; d <= 3; d++) {
            vm.expectEmit(address(col));
            emit IERC5192.Locked(d);
            vm.expectEmit(address(col));
            emit Collectibles.Purchased(player, d, d);
            vm.prank(player);
            col.buy{value: 0.05 ether}(d);

            assertEq(col.ownerOf(d), player);
            assertEq(col.tokenDesign(d), d);
            assertTrue(col.ownsDesign(player, d));
            assertEq(col.minted(d), 1);
        }
        assertEq(col.balanceOf(player), 3);
        assertEq(address(col).balance, 0.15 ether);
        assertFalse(col.ownsDesign(other, 1));
        assertFalse(col.ownsDesign(player, 0));
        assertFalse(col.ownsDesign(player, 4));
    }

    function test_RevertWhen_BadDesign() public {
        vm.startPrank(player);
        vm.expectRevert(Collectibles.BadDesign.selector);
        col.buy{value: 0.05 ether}(0);
        vm.expectRevert(Collectibles.BadDesign.selector);
        col.buy{value: 0.05 ether}(4);
        vm.stopPrank();
    }

    function test_RevertWhen_WrongPrice() public {
        vm.startPrank(player);
        vm.expectRevert(Collectibles.WrongPrice.selector);
        col.buy{value: 0.04 ether}(1);
        vm.expectRevert(Collectibles.WrongPrice.selector);
        col.buy{value: 0.06 ether}(1);
        vm.expectRevert(Collectibles.WrongPrice.selector);
        col.buy(1);
        vm.stopPrank();
    }

    function test_RevertWhen_AlreadyOwned() public {
        _buy(player, 2);
        vm.prank(player);
        vm.expectRevert(Collectibles.AlreadyOwned.selector);
        col.buy{value: 0.05 ether}(2);
    }

    function test_RevertWhen_SoldOut() public {
        uint256[4] memory supply = cfg.supply;
        supply[1] = 1;
        Collectibles small = new Collectibles(cfg.priceWei, supply, BASE_URI);
        vm.prank(player);
        small.buy{value: 0.05 ether}(1);
        vm.prank(other);
        vm.expectRevert(Collectibles.SoldOut.selector);
        small.buy{value: 0.05 ether}(1);
        // desain lain tidak terpengaruh
        vm.prank(other);
        small.buy{value: 0.05 ether}(2);
    }

    // ------------------------------------------------------------ soulbound

    function test_RevertWhen_Transfer() public {
        uint256 id = _buy(player, 1);
        vm.startPrank(player);
        vm.expectRevert(Collectibles.Soulbound.selector);
        col.transferFrom(player, other, id);
        vm.expectRevert(Collectibles.Soulbound.selector);
        col.safeTransferFrom(player, other, id);
        vm.expectRevert(Collectibles.Soulbound.selector);
        col.approve(other, id);
        vm.expectRevert(Collectibles.Soulbound.selector);
        col.setApprovalForAll(other, true);
        vm.stopPrank();
        assertEq(col.ownerOf(id), player);
    }

    function test_Locked() public {
        uint256 id = _buy(player, 3);
        assertTrue(col.locked(id));
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 99));
        col.locked(99);
    }

    function test_SupportsInterface() public view {
        assertTrue(col.supportsInterface(0xb45a3c0e)); // IERC5192
        assertTrue(col.supportsInterface(0x80ac58cd)); // IERC721
        assertTrue(col.supportsInterface(0x5b5e139f)); // IERC721Metadata
        assertTrue(col.supportsInterface(0x49064906)); // IERC4906
        assertFalse(col.supportsInterface(0xffffffff));
    }

    // ------------------------------------------------------------ metadata

    function test_TokenURIUsesDesign() public {
        _buy(player, 3);
        _buy(other, 1);
        assertEq(col.tokenURI(1), string.concat(BASE_URI, "3.json"));
        assertEq(col.tokenURI(2), string.concat(BASE_URI, "1.json"));
    }

    function test_SetBaseURI() public {
        uint256 id = _buy(player, 2);
        vm.expectEmit(address(col));
        emit Collectibles.BatchMetadataUpdate(1, type(uint256).max);
        col.setBaseURI("ipfs://cid/");
        assertEq(col.tokenURI(id), "ipfs://cid/2.json");
    }

    function test_RevertWhen_NonOwnerSetsBaseURI() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        col.setBaseURI("https://evil/");
    }

    // ------------------------------------------------------------ treasury

    function test_Withdraw() public {
        _buy(player, 1);
        _buy(other, 1);
        col.withdraw(payable(treasury));
        assertEq(treasury.balance, 0.1 ether);
        assertEq(address(col).balance, 0);
    }

    function test_RevertWhen_NonOwnerWithdraws() public {
        _buy(player, 1);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        col.withdraw(payable(other));
    }

    // ------------------------------------------------------------ deploy script

    function test_DeployScript() public {
        (address deployer, uint256 key) = makeAddrAndKey("deployer");
        Collectibles c = new DeployCollectibles().deploy(key, BASE_URI);
        assertEq(c.owner(), deployer);
        assertEq(c.price(1), 0.05 ether);
        assertEq(c.supply(3), 100);
    }
}
