// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Bagian CarNFT yang dibutuhkan RunRegistry (TECH_SPEC §6.2).
interface ICarNFT {
    function ownsTier(address owner, uint8 tier) external view returns (bool);
}
