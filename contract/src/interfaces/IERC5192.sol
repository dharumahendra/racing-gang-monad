// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice EIP-5192: Minimal Soulbound NFTs. Interface ID: 0xb45a3c0e.
/// @dev Tidak tersedia di OpenZeppelin v5.7.0, jadi ditulis sendiri.
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    function locked(uint256 tokenId) external view returns (bool);
}
