// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {RunRegistry} from "../src/RunRegistry.sol";
import {CarsConfig} from "../script/CarsConfig.sol";

/// Ukuran gas submitBatch (SC-6). Jalankan dengan `forge test --isolate --match-contract RunRegistryGas -vv`
/// supaya tiap panggilan jadi transaksi sendiri (slot storage dingin seperti di chain).
/// Gas EVM dari forge memakai harga Ethereum; perkiraan Monad menambah selisih akses slot dingin
/// (8.100 vs 2.100 gas, skill monskills `gas`) untuk tiap slot unik yang disentuh.
contract RunRegistryGasTest is Test {
    uint256 constant MONAD_COLD_SLOT_EXTRA = 6000;

    RunRegistry reg;
    CarsConfig.Cars cars;
    address attester = makeAddr("attester");
    address player = makeAddr("player");
    bytes32 constant RUN = keccak256("run-gas");

    function setUp() public {
        cars = CarsConfig.load();
        reg = new RunRegistry(attester, cars.reqNearMiss, cars.minCarTier);
        reg.setCarNFT(makeAddr("nft"));
        vm.roll(103);
        vm.setBlockhash(100, keccak256("block 100"));
    }

    function _measure(
        string memory label,
        RunRegistry.StartRec[] memory s,
        RunRegistry.NearMissRec[] memory n,
        RunRegistry.EndRec[] memory e
    ) internal returns (uint256 evmGas, uint256 monadGas) {
        vm.record();
        vm.prank(attester);
        reg.submitBatch(s, n, e);
        evmGas = _lastCallGasUsed();
        (bytes32[] memory reads, bytes32[] memory writes) = vm.accesses(address(reg));

        // Tiap slot unik = satu akses dingin (tulis selalu didahului baca slot yang sama).
        bytes32[] memory seen = new bytes32[](reads.length + writes.length);
        uint256 unique;
        for (uint256 i; i < reads.length + writes.length; i++) {
            bytes32 slot = i < reads.length ? reads[i] : writes[i - reads.length];
            bool dup;
            for (uint256 k; k < unique; k++) {
                if (seen[k] == slot) dup = true;
            }
            if (!dup) seen[unique++] = slot;
        }
        monadGas = evmGas + unique * MONAD_COLD_SLOT_EXTRA;
        console.log(label);
        console.log("  slot unik", unique);
        console.log("  gas EVM  ", evmGas);
        console.log("  Monad +- ", monadGas);
    }

    /// forge-std v1.17 menambah field di struct `Gas` yang belum dikembalikan forge 1.7.1, jadi
    /// `vm.lastCallGas()` gagal di-decode. Ambil `gasTotalUsed` (word kedua) langsung.
    function _lastCallGasUsed() internal view returns (uint256 used) {
        (bool ok, bytes memory ret) = address(vm).staticcall(abi.encodeWithSignature("lastCallGas()"));
        require(ok && ret.length >= 64, "lastCallGas");
        (, used) = abi.decode(ret, (uint256, uint256));
    }

    function _start() internal pure returns (RunRegistry.StartRec[] memory) {
        return new RunRegistry.StartRec[](0);
    }

    function _noNear() internal pure returns (RunRegistry.NearMissRec[] memory) {
        return new RunRegistry.NearMissRec[](0);
    }

    function _noEnd() internal pure returns (RunRegistry.EndRec[] memory) {
        return new RunRegistry.EndRec[](0);
    }

    function _near(uint16 from, uint16 to) internal pure returns (RunRegistry.NearMissRec[] memory n) {
        n = new RunRegistry.NearMissRec[](to - from + 1);
        for (uint16 i = from; i <= to; i++) {
            n[i - from] = RunRegistry.NearMissRec(RUN, i, i * 10, 0, i, keccak256(abi.encode(i)));
        }
    }

    function test_Gas_SubmitBatch() public {
        RunRegistry.StartRec[] memory s = new RunRegistry.StartRec[](1);
        s[0] = RunRegistry.StartRec(RUN, player, 0, 100, 1);
        _measure("start run", s, _noNear(), _noEnd());

        _measure("1 mepet", _start(), _near(1, 1), _noEnd());
        _measure("5 mepet", _start(), _near(2, 6), _noEnd());
        _measure("33 mepet (sampai 39)", _start(), _near(7, 39), _noEnd());
        _measure("1 mepet + lulus tier 1 (ke-40)", _start(), _near(40, 40), _noEnd());

        RunRegistry.EndRec[] memory e = new RunRegistry.EndRec[](1);
        e[0] = RunRegistry.EndRec(RUN, 0, 3000, 40, bytes32(uint256(1)));
        _measure("end run", _start(), _noNear(), e);
    }
}
