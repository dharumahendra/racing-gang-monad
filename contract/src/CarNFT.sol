// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ICarNFT} from "./interfaces/ICarNFT.sol";
import {IERC5192} from "./interfaces/IERC5192.sol";
import {IRunRegistry} from "./interfaces/IRunRegistry.sol";

/// @title CarNFT — Racing Gang Cars (RGC)
/// @notice Mobil tier 1–4 sebagai NFT soulbound (ERC-721 + ERC-5192), TECH_SPEC §6.2–6.3.
///         Satu-satunya cara mint adalah `buy()`: pembeli harus lulus syarat di RunRegistry,
///         membawa voucher koin dari backend (EIP-712), dan membayar harga MON.
contract CarNFT is ERC721, EIP712, Ownable, ICarNFT, IERC5192 {
    struct Voucher {
        address buyer;
        uint8 tier;
        uint32 coinCost;
        uint256 nonce;
        uint64 expiry;
    }

    bytes32 public constant VOUCHER_TYPEHASH =
        keccak256("Voucher(address buyer,uint8 tier,uint32 coinCost,uint256 nonce,uint64 expiry)");
    uint8 public constant MAX_TIER = 4;

    IRunRegistry public immutable registry;

    // Harga (wei) dan suplai maksimum per tier, immutable.
    uint256 private immutable _price1;
    uint256 private immutable _price2;
    uint256 private immutable _price3;
    uint256 private immutable _price4;
    uint256 private immutable _supply1;
    uint256 private immutable _supply2;
    uint256 private immutable _supply3;
    uint256 private immutable _supply4;

    address public voucherSigner;
    string private _baseTokenURI;
    uint256 private _nextTokenId = 1;

    mapping(uint8 tier => uint256) public minted;
    mapping(uint256 nonce => bool) public voucherUsed;
    mapping(address owner => uint8) private _ownedMask; // bit t = memiliki tier t
    mapping(uint256 tokenId => uint8) private _tokenTier;
    mapping(uint256 tokenId => bytes32) private _tokenRun;

    event Purchased(
        address indexed buyer, uint8 indexed tier, uint256 tokenId, uint256 voucherNonce, uint32 coinCost, bytes32 runId
    );

    /// @notice ERC-4906: wallet/explorer memuat ulang metadata token dalam rentang ini.
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    error NotQualified();
    error WrongPrice();
    error SoldOut();
    error AlreadyOwned();
    error VoucherExpired();
    error VoucherUsed();
    error BadSignature();
    error WrongBuyer();
    error Soulbound();
    error BadTier();
    error InvalidConfig();

    /// @param price_  Harga dalam wei, index = tier (index 0 diabaikan).
    /// @param supply_ Suplai maksimum, index = tier (index 0 diabaikan); harus > 0.
    constructor(
        address registry_,
        address voucherSigner_,
        uint256[5] memory price_,
        uint256[5] memory supply_,
        string memory baseURI_
    ) ERC721("Racing Gang Cars", "RGC") EIP712("RacingGangCars", "1") Ownable(msg.sender) {
        if (registry_ == address(0)) revert InvalidConfig();
        for (uint256 t = 1; t <= MAX_TIER; t++) {
            if (supply_[t] == 0) revert InvalidConfig();
        }
        registry = IRunRegistry(registry_);
        voucherSigner = voucherSigner_;
        _price1 = price_[1];
        _price2 = price_[2];
        _price3 = price_[3];
        _price4 = price_[4];
        _supply1 = supply_[1];
        _supply2 = supply_[2];
        _supply3 = supply_[3];
        _supply4 = supply_[4];
        _baseTokenURI = baseURI_;
    }

    // ---------------------------------------------------------------- beli

    function buy(Voucher calldata v, bytes calldata sig) external payable {
        if (msg.sender != v.buyer) revert WrongBuyer();
        // forge-lint: disable-next-line(block-timestamp) kedaluwarsa voucher 10 menit, selisih detik tidak berarti
        if (block.timestamp > v.expiry) revert VoucherExpired();
        if (voucherUsed[v.nonce]) revert VoucherUsed();
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(voucherDigest(v), sig);
        if (err != ECDSA.RecoverError.NoError || signer != voucherSigner) revert BadSignature();
        if (v.tier == 0 || v.tier > MAX_TIER) revert BadTier();
        if (!registry.isQualified(msg.sender, v.tier)) revert NotQualified();
        if (msg.value != price(v.tier)) revert WrongPrice();
        uint8 bit = _bit(v.tier);
        if (_ownedMask[msg.sender] & bit != 0) revert AlreadyOwned();
        if (minted[v.tier] >= supply(v.tier)) revert SoldOut();

        voucherUsed[v.nonce] = true;
        _ownedMask[msg.sender] |= bit;
        minted[v.tier] += 1;
        uint256 tokenId = _nextTokenId++;
        bytes32 runId = registry.qualifyingRun(msg.sender, v.tier);
        _tokenTier[tokenId] = v.tier;
        _tokenRun[tokenId] = runId;

        // _mint (bukan _safeMint): tidak ada callback ke pembeli, jadi tidak ada celah reentrancy.
        _mint(msg.sender, tokenId);
        emit Locked(tokenId);
        emit Purchased(msg.sender, v.tier, tokenId, v.nonce, v.coinCost, runId);
    }

    /// @notice Digest EIP-712 yang ditandatangani voucher signer backend.
    function voucherDigest(Voucher calldata v) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(VOUCHER_TYPEHASH, v.buyer, v.tier, v.coinCost, v.nonce, v.expiry)));
    }

    // ---------------------------------------------------------------- soulbound

    /// @dev Hanya mint yang diizinkan; transfer dan burn selalu revert.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = super._update(to, tokenId, auth);
        if (from != address(0)) revert Soulbound();
        return from;
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || interfaceId == bytes4(0x49064906) // ERC-4906
            || super.supportsInterface(interfaceId);
    }

    // ---------------------------------------------------------------- view

    function ownsTier(address owner, uint8 tier) external view returns (bool) {
        if (tier == 0 || tier > MAX_TIER) return false;
        return _ownedMask[owner] & _bit(tier) != 0;
    }

    function tokenTier(uint256 tokenId) external view returns (uint8) {
        _requireOwned(tokenId);
        return _tokenTier[tokenId];
    }

    function tokenRun(uint256 tokenId) external view returns (bytes32) {
        _requireOwned(tokenId);
        return _tokenRun[tokenId];
    }

    function price(uint8 tier) public view returns (uint256) {
        if (tier == 1) return _price1;
        if (tier == 2) return _price2;
        if (tier == 3) return _price3;
        if (tier == 4) return _price4;
        return 0;
    }

    function supply(uint8 tier) public view returns (uint256) {
        if (tier == 1) return _supply1;
        if (tier == 2) return _supply2;
        if (tier == 3) return _supply3;
        if (tier == 4) return _supply4;
        return 0;
    }

    /// @notice baseURI + tier + ".json"
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(_baseTokenURI, Strings.toString(_tokenTier[tokenId]), ".json");
    }

    /// @dev tier ≤ MAX_TIER (4), jadi 2**tier ≤ 16 muat di uint8.
    function _bit(uint8 tier) private pure returns (uint8) {
        return uint8(2) ** tier;
    }

    // ---------------------------------------------------------------- owner

    function setVoucherSigner(address s) external onlyOwner {
        voucherSigner = s;
    }

    /// @notice Ganti lokasi metadata (hanya tampilan). Syarat, harga, dan suplai tetap immutable.
    ///         Event ERC-4906 memberi tahu wallet/explorer agar memuat ulang metadata semua token.
    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        emit BatchMetadataUpdate(1, type(uint256).max);
    }

    /// @notice Kirim seluruh MON hasil penjualan ke treasury.
    function withdraw(address payable to) external onlyOwner {
        Address.sendValue(to, address(this).balance);
    }
}
