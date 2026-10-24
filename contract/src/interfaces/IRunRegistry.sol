// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Bagian RunRegistry yang dibutuhkan CarNFT (TECH_SPEC §6.1).
interface IRunRegistry {
    function isQualified(address player, uint8 tier) external view returns (bool);
    function qualifyingRun(address player, uint8 tier) external view returns (bytes32);
}
