// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC5192} from "./interfaces/IERC5192.sol";

/// @title Collectibles — Racing Gang Collectibles (RGX)
/// @notice Koleksi kosmetik terpisah dari CarNFT: tanpa efek gameplay dan tanpa syarat tier.
///         Dibeli dengan MON, satu per desain per wallet, soulbound (ERC-5192).
///         Harga dan suplai per desain immutable; tidak ada fungsi mint admin.
contract Collectibles is ERC721, Ownable, IERC5192 {
    uint8 public constant MAX_DESIGN = 3;

    // Harga (wei) dan suplai maksimum per desain, immutable.
    uint256 private immutable _price1;
    uint256 private immutable _price2;
    uint256 private immutable _price3;
    uint256 private immutable _supply1;
    uint256 private immutable _supply2;
    uint256 private immutable _supply3;

    string private _baseTokenURI;
    uint256 private _nextTokenId = 1;

    mapping(uint8 design => uint256) public minted;
    mapping(address owner => uint8) private _ownedMask; // bit d = memiliki desain d
    mapping(uint256 tokenId => uint8) private _tokenDesign;

    event Purchased(address indexed buyer, uint8 indexed design, uint256 tokenId);
    /// @notice ERC-4906: wallet/explorer memuat ulang metadata token dalam rentang ini.
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    error BadDesign();
    error WrongPrice();
    error SoldOut();
    error AlreadyOwned();
    error Soulbound();
    error InvalidConfig();

    /// @param price_  Harga dalam wei, index = desain (index 0 diabaikan).
    /// @param supply_ Suplai maksimum, index = desain (index 0 diabaikan); harus > 0.
    constructor(uint256[4] memory price_, uint256[4] memory supply_, string memory baseURI_)
        ERC721("Racing Gang Collectibles", "RGX")
        Ownable(msg.sender)
    {
        for (uint256 d = 1; d <= MAX_DESIGN; d++) {
            if (supply_[d] == 0) revert InvalidConfig();
        }
        _price1 = price_[1];
        _price2 = price_[2];
        _price3 = price_[3];
        _supply1 = supply_[1];
        _supply2 = supply_[2];
        _supply3 = supply_[3];
        _baseTokenURI = baseURI_;
    }

    // ---------------------------------------------------------------- beli

    function buy(uint8 design) external payable {
        if (design == 0 || design > MAX_DESIGN) revert BadDesign();
        if (msg.value != price(design)) revert WrongPrice();
        uint8 bit = _bit(design);
        if (_ownedMask[msg.sender] & bit != 0) revert AlreadyOwned();
        if (minted[design] >= supply(design)) revert SoldOut();

        _ownedMask[msg.sender] |= bit;
        minted[design] += 1;
        uint256 tokenId = _nextTokenId++;
        _tokenDesign[tokenId] = design;

        // _mint (bukan _safeMint): tidak ada callback ke pembeli, jadi tidak ada celah reentrancy.
        _mint(msg.sender, tokenId);
        emit Locked(tokenId);
        emit Purchased(msg.sender, design, tokenId);
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

    function ownsDesign(address owner, uint8 design) external view returns (bool) {
        if (design == 0 || design > MAX_DESIGN) return false;
        return _ownedMask[owner] & _bit(design) != 0;
    }

    function tokenDesign(uint256 tokenId) external view returns (uint8) {
        _requireOwned(tokenId);
        return _tokenDesign[tokenId];
    }

    function price(uint8 design) public view returns (uint256) {
        if (design == 1) return _price1;
        if (design == 2) return _price2;
        if (design == 3) return _price3;
        return 0;
    }

    function supply(uint8 design) public view returns (uint256) {
        if (design == 1) return _supply1;
        if (design == 2) return _supply2;
        if (design == 3) return _supply3;
        return 0;
    }

    /// @notice baseURI + desain + ".json"
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(_baseTokenURI, Strings.toString(_tokenDesign[tokenId]), ".json");
    }

    /// @dev desain ≤ MAX_DESIGN (3), jadi 2**desain ≤ 8 muat di uint8.
    function _bit(uint8 design) private pure returns (uint8) {
        return uint8(2) ** design;
    }

    // ---------------------------------------------------------------- owner

    /// @notice Ganti lokasi metadata (hanya tampilan). Harga dan suplai tetap immutable.
    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        emit BatchMetadataUpdate(1, type(uint256).max);
    }

    /// @notice Kirim seluruh MON hasil penjualan ke treasury.
    function withdraw(address payable to) external onlyOwner {
        Address.sendValue(to, address(this).balance);
    }
}
