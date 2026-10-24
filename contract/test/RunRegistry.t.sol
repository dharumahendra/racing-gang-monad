// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {RunRegistry} from "../src/RunRegistry.sol";
import {ICarNFT} from "../src/interfaces/ICarNFT.sol";
import {CarsConfig} from "../script/CarsConfig.sol";

contract MockCarNFT is ICarNFT {
    mapping(address => mapping(uint8 => bool)) public owns;

    function setOwns(address owner, uint8 tier, bool value) external {
        owns[owner][tier] = value;
    }

    function ownsTier(address owner, uint8 tier) external view returns (bool) {
        return owns[owner][tier];
    }
}

contract RunRegistryTest is Test {
    RunRegistry reg;
    MockCarNFT nft;
    CarsConfig.Cars cars;

    address attester = makeAddr("attester");
    address player = makeAddr("player");

    uint64 constant SEED_BLOCK = 100;
    bytes32 constant SEED_HASH = keccak256("block 100");
    bytes32 constant RUN = keccak256("run-1");
    bytes32 constant RUN2 = keccak256("run-2");

    function setUp() public {
        cars = CarsConfig.load();
        reg = new RunRegistry(attester, cars.reqNearMiss, cars.minCarTier);
        nft = new MockCarNFT();
        reg.setCarNFT(address(nft));

        vm.roll(SEED_BLOCK + 3);
        vm.setBlockhash(SEED_BLOCK, SEED_HASH);
    }

    // ------------------------------------------------------------ helpers

    function _noStart() internal pure returns (RunRegistry.StartRec[] memory) {
        return new RunRegistry.StartRec[](0);
    }

    function _noNear() internal pure returns (RunRegistry.NearMissRec[] memory) {
        return new RunRegistry.NearMissRec[](0);
    }

    function _noEnd() internal pure returns (RunRegistry.EndRec[] memory) {
        return new RunRegistry.EndRec[](0);
    }

    function _startRecs(bytes32 runId, uint8 carTier, uint64 seedBlock)
        internal
        view
        returns (RunRegistry.StartRec[] memory s)
    {
        s = new RunRegistry.StartRec[](1);
        s[0] = RunRegistry.StartRec(runId, player, carTier, seedBlock, 1);
    }

    /// Mepet dengan index from..to; tick = index supaya selalu naik.
    function _nearRecs(bytes32 runId, uint16 from, uint16 to)
        internal
        pure
        returns (RunRegistry.NearMissRec[] memory n)
    {
        n = new RunRegistry.NearMissRec[](to - from + 1);
        for (uint16 i = from; i <= to; i++) {
            n[i - from] = RunRegistry.NearMissRec(runId, i, i, 0, i, keccak256(abi.encode(i)));
        }
    }

    function _endRecs(bytes32 runId, uint16 endTick, uint16 total)
        internal
        pure
        returns (RunRegistry.EndRec[] memory e)
    {
        e = new RunRegistry.EndRec[](1);
        e[0] = RunRegistry.EndRec(runId, 1, endTick, total, bytes32(uint256(1)));
    }

    function _submit(RunRegistry.StartRec[] memory s, RunRegistry.NearMissRec[] memory n, RunRegistry.EndRec[] memory e)
        internal
    {
        vm.prank(attester);
        reg.submitBatch(s, n, e);
    }

    function _start(bytes32 runId, uint8 carTier) internal {
        _submit(_startRecs(runId, carTier, SEED_BLOCK), _noNear(), _noEnd());
    }

    function _near(bytes32 runId, uint16 from, uint16 to) internal {
        _submit(_noStart(), _nearRecs(runId, from, to), _noEnd());
    }

    function _countLogs(Vm.Log[] memory logs, bytes32 topic0) internal pure returns (uint256 c) {
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].topics[0] == topic0) c++;
        }
    }

    // ------------------------------------------------------------ config & akses

    function test_ConfigFromCars() public view {
        for (uint8 t = 1; t <= 4; t++) {
            assertEq(reg.reqNearMiss(t), cars.reqNearMiss[t]);
            assertEq(reg.minCarTier(t), cars.minCarTier[t]);
        }
        assertEq(reg.reqNearMiss(0), 0);
        assertEq(reg.reqNearMiss(5), 0);
    }

    function test_RevertWhen_InvalidConfig() public {
        uint16[5] memory req = cars.reqNearMiss;
        uint8[5] memory minT = cars.minCarTier;

        req[1] = 0;
        vm.expectRevert(RunRegistry.InvalidConfig.selector);
        new RunRegistry(attester, req, minT);

        req = cars.reqNearMiss;
        minT[2] = 2;
        vm.expectRevert(RunRegistry.InvalidConfig.selector);
        new RunRegistry(attester, req, minT);
    }

    function test_RevertWhen_NotAttester() public {
        vm.prank(player);
        vm.expectRevert(RunRegistry.NotAttester.selector);
        reg.submitBatch(_startRecs(RUN, 0, SEED_BLOCK), _noNear(), _noEnd());
    }

    function test_SetAttester() public {
        address next = makeAddr("next");
        reg.setAttester(next);
        assertEq(reg.attester(), next);

        vm.prank(attester);
        vm.expectRevert(RunRegistry.NotAttester.selector);
        reg.submitBatch(_startRecs(RUN, 0, SEED_BLOCK), _noNear(), _noEnd());
    }

    function test_RevertWhen_NonOwnerSetsAttester() public {
        vm.prank(player);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, player));
        reg.setAttester(player);
    }

    function test_RevertWhen_SetCarNFTTwice() public {
        vm.expectRevert(RunRegistry.CarNFTAlreadySet.selector);
        reg.setCarNFT(address(1));
    }

    // ------------------------------------------------------------ StartRec

    function test_StartComputesSeedFromBlockhash() public {
        bytes32 seed = keccak256(abi.encode(SEED_HASH, RUN, player));
        vm.expectEmit(address(reg));
        emit RunRegistry.RunStarted(RUN, player, 0, seed, SEED_BLOCK, 1);
        _start(RUN, 0);

        RunRegistry.Run memory r = reg.getRun(RUN);
        assertEq(r.player, player);
        assertEq(r.seed, seed);
        assertEq(r.startBlock, block.number);
        assertEq(r.configVersion, 1);
        assertFalse(r.ended);
    }

    function test_RevertWhen_SeedBlockNotInPast() public {
        vm.expectRevert(RunRegistry.SeedBlockInvalid.selector);
        _submit(_startRecs(RUN, 0, uint64(block.number)), _noNear(), _noEnd());
    }

    function test_RevertWhen_SeedBlockTooOld() public {
        vm.roll(SEED_BLOCK + 257);
        vm.expectRevert(RunRegistry.SeedBlockInvalid.selector);
        _start(RUN, 0);
    }

    function test_StartAtSeedWindowEdge() public {
        vm.roll(SEED_BLOCK + 256);
        vm.setBlockhash(SEED_BLOCK, SEED_HASH);
        _start(RUN, 0);
    }

    function test_RevertWhen_SeedBlockhashZero() public {
        vm.setBlockhash(SEED_BLOCK + 1, bytes32(0));
        vm.expectRevert(RunRegistry.SeedBlockInvalid.selector);
        _submit(_startRecs(RUN, 0, SEED_BLOCK + 1), _noNear(), _noEnd());
    }

    function test_RevertWhen_RunExists() public {
        _start(RUN, 0);
        vm.expectRevert(RunRegistry.RunExists.selector);
        _start(RUN, 0);
    }

    function test_RevertWhen_CarTierNotOwned() public {
        vm.expectRevert(RunRegistry.CarNotOwned.selector);
        _start(RUN, 1);
    }

    function test_StartWithOwnedCar() public {
        nft.setOwns(player, 2, true);
        _start(RUN, 2);
        assertEq(reg.getRun(RUN).carTier, 2);
    }

    function test_RevertWhen_CarNFTNotSet() public {
        RunRegistry fresh = new RunRegistry(attester, cars.reqNearMiss, cars.minCarTier);
        vm.prank(attester);
        vm.expectRevert(RunRegistry.CarNotOwned.selector);
        fresh.submitBatch(_startRecs(RUN, 1, SEED_BLOCK), _noNear(), _noEnd());
    }

    // ------------------------------------------------------------ NearMissRec

    function test_NearMissRecorded() public {
        _start(RUN, 0);
        vm.expectEmit(address(reg));
        emit RunRegistry.NearMiss(RUN, player, 1, 1, 0, 1, keccak256(abi.encode(uint16(1))));
        _near(RUN, 1, 1);

        RunRegistry.Run memory r = reg.getRun(RUN);
        assertEq(r.nearMisses, 1);
        assertEq(r.lastTick, 1);
    }

    function test_DuplicateIndexSkipped() public {
        _start(RUN, 0);
        _near(RUN, 1, 3);

        vm.recordLogs();
        _near(RUN, 2, 4); // 2 dan 3 duplikat, hanya 4 yang baru
        assertEq(_countLogs(vm.getRecordedLogs(), RunRegistry.NearMiss.selector), 1);
        assertEq(reg.getRun(RUN).nearMisses, 4);
    }

    function test_RevertWhen_IndexGap() public {
        _start(RUN, 0);
        vm.expectRevert(RunRegistry.IndexGap.selector);
        _near(RUN, 2, 2);
    }

    function test_RevertWhen_UnknownRun() public {
        vm.expectRevert(RunRegistry.UnknownRun.selector);
        _near(RUN, 1, 1);
    }

    function test_RevertWhen_TickAboveMax() public {
        _start(RUN, 0);
        RunRegistry.NearMissRec[] memory n = _nearRecs(RUN, 1, 1);
        n[0].tick = 3001;
        vm.expectRevert(RunRegistry.TickOutOfRange.selector);
        _submit(_noStart(), n, _noEnd());

        n[0].tick = 3000;
        _submit(_noStart(), n, _noEnd());
    }

    function test_RevertWhen_TickGoesBackwards() public {
        _start(RUN, 0);
        _near(RUN, 1, 5); // lastTick = 5
        RunRegistry.NearMissRec[] memory n = _nearRecs(RUN, 6, 6);
        n[0].tick = 4;
        vm.expectRevert(RunRegistry.TickOutOfRange.selector);
        _submit(_noStart(), n, _noEnd());
    }

    function test_SameTickAllowed() public {
        _start(RUN, 0);
        RunRegistry.NearMissRec[] memory n = _nearRecs(RUN, 1, 2);
        n[1].tick = n[0].tick;
        _submit(_noStart(), n, _noEnd());
        assertEq(reg.getRun(RUN).nearMisses, 2);
    }

    function test_RevertWhen_RunTooOld() public {
        _start(RUN, 0);
        uint256 startBlock = block.number;

        vm.roll(startBlock + 750);
        _near(RUN, 1, 1);

        vm.roll(startBlock + 751);
        vm.expectRevert(RunRegistry.RunTooOld.selector);
        _near(RUN, 2, 2);
    }

    // ------------------------------------------------------------ kelulusan

    function test_QualifiedExactlyAtThresholds() public {
        nft.setOwns(player, 3, true);
        _start(RUN, 3); // Tier 3 memenuhi minCarTier semua tier

        uint16 done;
        for (uint8 t = 1; t <= 4; t++) {
            uint16 req = cars.reqNearMiss[t];
            _near(RUN, done + 1, req - 1);
            assertFalse(reg.isQualified(player, t));

            vm.expectEmit(address(reg));
            emit RunRegistry.Qualified(player, t, RUN, req);
            _near(RUN, req, req);

            assertTrue(reg.isQualified(player, t));
            assertEq(reg.qualifyingRun(player, t), RUN);
            done = req;
        }
    }

    function test_StarterReaching150OnlyQualifiesTier1() public {
        _start(RUN, 0);
        _near(RUN, 1, 150);

        assertTrue(reg.isQualified(player, 1));
        assertFalse(reg.isQualified(player, 2));
        assertFalse(reg.isQualified(player, 3));
        assertFalse(reg.isQualified(player, 4));
    }

    function test_Tier1CarQualifiesUpToTier2() public {
        nft.setOwns(player, 1, true);
        _start(RUN, 1);
        _near(RUN, 1, 150);

        assertTrue(reg.isQualified(player, 1));
        assertTrue(reg.isQualified(player, 2));
        assertFalse(reg.isQualified(player, 3));
        assertFalse(reg.isQualified(player, 4));
    }

    function test_QualifiedNotReemitted() public {
        _start(RUN, 0);
        _near(RUN, 1, 40);

        _submit(_startRecs(RUN2, 0, SEED_BLOCK), _noNear(), _noEnd());
        vm.recordLogs();
        _near(RUN2, 1, 40);
        assertEq(_countLogs(vm.getRecordedLogs(), RunRegistry.Qualified.selector), 0);
        assertEq(reg.qualifyingRun(player, 1), RUN);
    }

    function test_IsQualifiedOutOfRangeTier() public {
        _start(RUN, 0);
        _near(RUN, 1, 40);
        assertFalse(reg.isQualified(player, 0));
        assertFalse(reg.isQualified(player, 5));
    }

    // ------------------------------------------------------------ EndRec

    function test_EndRun() public {
        _start(RUN, 0);
        _near(RUN, 1, 3);

        vm.expectEmit(address(reg));
        emit RunRegistry.RunEnded(RUN, 1, 100, 3, bytes32(uint256(1)));
        _submit(_noStart(), _noNear(), _endRecs(RUN, 100, 3));

        RunRegistry.Run memory r = reg.getRun(RUN);
        assertTrue(r.ended);
        assertEq(r.endReason, 1);
    }

    function test_RevertWhen_EndCountMismatch() public {
        _start(RUN, 0);
        _near(RUN, 1, 3);
        vm.expectRevert(RunRegistry.CountMismatch.selector);
        _submit(_noStart(), _noNear(), _endRecs(RUN, 100, 2));
    }

    function test_RevertWhen_EndTickOutOfRange() public {
        _start(RUN, 0);
        _near(RUN, 1, 3);
        vm.expectRevert(RunRegistry.TickOutOfRange.selector);
        _submit(_noStart(), _noNear(), _endRecs(RUN, 3001, 3));

        vm.expectRevert(RunRegistry.TickOutOfRange.selector);
        _submit(_noStart(), _noNear(), _endRecs(RUN, 2, 3)); // sebelum mepet terakhir
    }

    function test_RevertWhen_RecordAfterEnded() public {
        _start(RUN, 0);
        _near(RUN, 1, 3);
        _submit(_noStart(), _noNear(), _endRecs(RUN, 100, 3));

        vm.expectRevert(RunRegistry.RunAlreadyEnded.selector);
        _near(RUN, 4, 4);

        vm.expectRevert(RunRegistry.RunAlreadyEnded.selector);
        _submit(_noStart(), _noNear(), _endRecs(RUN, 100, 3));
    }

    function test_DuplicateAfterEndedSkipped() public {
        _start(RUN, 0);
        _near(RUN, 1, 3);
        _submit(_noStart(), _noNear(), _endRecs(RUN, 100, 3));
        _near(RUN, 2, 3); // retry relayer: tidak revert
    }

    function test_FullRunInOneBatch() public {
        _submit(_startRecs(RUN, 0, SEED_BLOCK), _nearRecs(RUN, 1, 40), _endRecs(RUN, 3000, 40));

        RunRegistry.Run memory r = reg.getRun(RUN);
        assertEq(r.nearMisses, 40);
        assertTrue(r.ended);
        assertTrue(reg.isQualified(player, 1));
    }
}
