// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

/// Hash chain log input (TECH_SPEC §3.8) versi Solidity harus identik dengan `initialHash`/`appendHash`
/// di packages/sim. Vektor yang sama dikunci di packages/sim/test/hash-vector.test.ts (BACKEND_PLAN D3).
contract HashChainTest is Test {
    function initialHash(bytes32 runId, bytes32 seed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(runId, seed));
    }

    function appendHash(bytes32 h, uint16 tick, uint8 kind, uint32 data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(h, tick, kind, data));
    }

    function test_MatchesSimVector() public pure {
        bytes32 runId = keccak256("racing-gang/hash-vector/run");
        bytes32 seed = keccak256("racing-gang/hash-vector/seed");

        bytes32 h = initialHash(runId, seed);
        assertEq(h, 0xa3fae1ba9283d8ed35229e41059d867142baf8d505f679461b24617b5a07ea0e);

        h = appendHash(h, 1, 1, 0); // LEFT
        assertEq(h, 0x73b17593cb0df98c601d7afa4dce163269a9b1edcb1b38837871efa5aad23f18);

        h = appendHash(h, 2, 12, 2 | (1 << 8)); // SPEC_RED lajur 2, durasi 5 dtk
        assertEq(h, 0xfb3c6ff4842a9d8793989e94f1cac3ce5cd9420c78ce33c63844e208ae3d5afc);

        h = appendHash(h, 3000, 3, 0); // BRAKE_ON di tick terakhir
        assertEq(h, 0x2b1e0b6c37d383ee886510552a520135ca10807b638627244aa62c523fb84fed);
    }
}
