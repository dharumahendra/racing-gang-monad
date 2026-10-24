// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICarNFT} from "./interfaces/ICarNFT.sol";
import {IRunRegistry} from "./interfaces/IRunRegistry.sol";

/// @title RunRegistry
/// @notice Catatan run, mepet, dan kelulusan tier mobil di Monad (TECH_SPEC §6.1).
///         Hanya attester (relayer backend) yang boleh mencatat. Status lulus di sini adalah
///         sumber kebenaran untuk gerbang pembelian CarNFT.
contract RunRegistry is Ownable, IRunRegistry {
    struct Run {
        address player;
        uint8 carTier;
        uint16 configVersion;
        bool ended;
        uint8 endReason;
        uint16 nearMisses;
        uint16 lastTick;
        uint64 startBlock;
        bytes32 seed;
    }

    struct StartRec {
        bytes32 runId;
        address player;
        uint8 carTier;
        uint64 seedBlock;
        uint16 configVersion;
    }

    struct NearMissRec {
        bytes32 runId;
        uint16 index;
        uint16 tick;
        uint8 vehicleType;
        uint32 vehicleId;
        bytes32 inputHash;
    }

    struct EndRec {
        bytes32 runId;
        uint8 reason; // 0 TIME_UP, 1 CRASH, 2 RED_ZONE_FAIL, 3 TIMEOUT
        uint16 endTick;
        uint16 totalNearMisses;
        bytes32 finalInputHash;
    }

    uint8 public constant MAX_TIER = 4;
    uint16 public constant MAX_TICK = 3000; // RUN_TICKS, 100 detik
    uint64 public constant MAX_RUN_BLOCK_SPAN = 750; // CHAIN.maxRunBlockSpan, ±5 menit
    uint256 private constant SEED_BLOCK_WINDOW = 256;

    // Syarat per tier dikemas supaya bisa immutable: 16 bit (reqNearMiss) dan 8 bit (minCarTier) per tier.
    uint256 private immutable _reqNearMissPacked;
    uint256 private immutable _minCarTierPacked;

    address public attester;
    ICarNFT public carNFT;

    mapping(bytes32 runId => Run) private _runs;
    mapping(address player => uint8) private _qualifiedMask; // bit t = lulus tier t
    mapping(address player => mapping(uint8 tier => bytes32)) private _qualifyingRun;

    event RunStarted(
        bytes32 indexed runId,
        address indexed player,
        uint8 carTier,
        bytes32 seed,
        uint64 seedBlock,
        uint16 configVersion
    );
    event NearMiss(
        bytes32 indexed runId,
        address indexed player,
        uint16 index,
        uint16 tick,
        uint8 vehicleType,
        uint32 vehicleId,
        bytes32 inputHash
    );
    event RunEnded(bytes32 indexed runId, uint8 reason, uint16 endTick, uint16 totalNearMisses, bytes32 finalInputHash);
    event Qualified(address indexed player, uint8 indexed tier, bytes32 runId, uint16 tick);

    error NotAttester();
    error RunExists();
    error UnknownRun();
    error RunAlreadyEnded();
    error IndexGap();
    error TickOutOfRange();
    error RunTooOld();
    error SeedBlockInvalid();
    error CarNotOwned();
    error CountMismatch();
    error CarNFTAlreadySet();
    error InvalidConfig();

    modifier onlyAttester() {
        if (msg.sender != attester) revert NotAttester();
        _;
    }

    /// @param reqNearMiss_ Jumlah mepet dalam 1 run untuk lulus, index = tier (index 0 diabaikan).
    /// @param minCarTier_  Tier mobil minimum saat run, index = tier (index 0 diabaikan).
    constructor(address attester_, uint16[5] memory reqNearMiss_, uint8[5] memory minCarTier_) Ownable(msg.sender) {
        uint256 req;
        uint256 minTier;
        for (uint256 t = 1; t <= MAX_TIER; t++) {
            if (reqNearMiss_[t] == 0 || minCarTier_[t] >= t) revert InvalidConfig();
            req |= uint256(reqNearMiss_[t]) << (16 * t);
            minTier |= uint256(minCarTier_[t]) << (8 * t);
        }
        _reqNearMissPacked = req;
        _minCarTierPacked = minTier;
        attester = attester_;
    }

    // ---------------------------------------------------------------- attester

    /// @notice Diproses berurutan: semua start, lalu semua mepet, lalu semua end.
    function submitBatch(StartRec[] calldata s, NearMissRec[] calldata n, EndRec[] calldata e) external onlyAttester {
        for (uint256 i; i < s.length; i++) {
            _start(s[i]);
        }
        for (uint256 i; i < n.length; i++) {
            _nearMiss(n[i]);
        }
        for (uint256 i; i < e.length; i++) {
            _end(e[i]);
        }
    }

    function _start(StartRec calldata r) private {
        Run storage run = _runs[r.runId];
        if (run.player != address(0)) revert RunExists();
        if (r.seedBlock >= block.number || block.number - r.seedBlock > SEED_BLOCK_WINDOW) revert SeedBlockInvalid();
        bytes32 bh = blockhash(r.seedBlock);
        if (bh == 0) revert SeedBlockInvalid();
        if (r.carTier != 0 && (address(carNFT) == address(0) || !carNFT.ownsTier(r.player, r.carTier))) {
            revert CarNotOwned();
        }

        bytes32 seed = keccak256(abi.encode(bh, r.runId, r.player));
        run.player = r.player;
        run.carTier = r.carTier;
        run.configVersion = r.configVersion;
        run.startBlock = uint64(block.number);
        run.seed = seed;

        emit RunStarted(r.runId, r.player, r.carTier, seed, r.seedBlock, r.configVersion);
    }

    function _nearMiss(NearMissRec calldata r) private {
        Run storage run = _runs[r.runId];
        if (run.player == address(0)) revert UnknownRun();
        uint16 count = run.nearMisses;
        // Idempoten untuk retry relayer: record yang sudah tercatat dilewati, termasuk setelah run selesai.
        if (r.index <= count) return;
        if (run.ended) revert RunAlreadyEnded();
        if (block.number - run.startBlock > MAX_RUN_BLOCK_SPAN) revert RunTooOld();
        if (r.index != count + 1) revert IndexGap();
        if (r.tick > MAX_TICK || r.tick < run.lastTick) revert TickOutOfRange();

        run.nearMisses = r.index;
        run.lastTick = r.tick;
        emit NearMiss(r.runId, run.player, r.index, r.tick, r.vehicleType, r.vehicleId, r.inputHash);

        _checkQualified(run.player, run.carTier, r.runId, r.index, r.tick);
    }

    function _checkQualified(address player, uint8 carTier, bytes32 runId, uint16 count, uint16 tick) private {
        uint8 mask = _qualifiedMask[player];
        uint8 newMask = mask;
        for (uint8 t = 1; t <= MAX_TIER; t++) {
            uint8 bit = _bit(t);
            if (count == _req(t) && carTier >= _minTier(t) && newMask & bit == 0) {
                newMask |= bit;
                _qualifyingRun[player][t] = runId;
                emit Qualified(player, t, runId, tick);
            }
        }
        if (newMask != mask) _qualifiedMask[player] = newMask;
    }

    function _end(EndRec calldata r) private {
        Run storage run = _runs[r.runId];
        if (run.player == address(0)) revert UnknownRun();
        if (run.ended) revert RunAlreadyEnded();
        if (r.totalNearMisses != run.nearMisses) revert CountMismatch();
        if (r.endTick > MAX_TICK || r.endTick < run.lastTick) revert TickOutOfRange();

        run.ended = true;
        run.endReason = r.reason;
        emit RunEnded(r.runId, r.reason, r.endTick, r.totalNearMisses, r.finalInputHash);
    }

    // ---------------------------------------------------------------- view

    function isQualified(address player, uint8 tier) external view returns (bool) {
        if (tier == 0 || tier > MAX_TIER) return false;
        return _qualifiedMask[player] & _bit(tier) != 0;
    }

    function qualifyingRun(address player, uint8 tier) external view returns (bytes32) {
        return _qualifyingRun[player][tier];
    }

    function getRun(bytes32 runId) external view returns (Run memory) {
        return _runs[runId];
    }

    function reqNearMiss(uint8 tier) external view returns (uint16) {
        return tier == 0 || tier > MAX_TIER ? 0 : _req(tier);
    }

    function minCarTier(uint8 tier) external view returns (uint8) {
        return tier == 0 || tier > MAX_TIER ? 0 : _minTier(tier);
    }

    function _req(uint8 tier) private view returns (uint16) {
        // forge-lint: disable-next-line(unsafe-typecast) sengaja mengambil 16 bit milik tier ini dari nilai terkemas
        return uint16(_reqNearMissPacked >> (16 * uint256(tier)));
    }

    function _minTier(uint8 tier) private view returns (uint8) {
        // forge-lint: disable-next-line(unsafe-typecast) sengaja mengambil 8 bit milik tier ini dari nilai terkemas
        return uint8(_minCarTierPacked >> (8 * uint256(tier)));
    }

    /// @dev tier ≤ MAX_TIER (4), jadi 2**tier ≤ 16 muat di uint8.
    function _bit(uint8 tier) private pure returns (uint8) {
        return uint8(2) ** tier;
    }

    // ---------------------------------------------------------------- owner

    function setAttester(address a) external onlyOwner {
        attester = a;
    }

    /// @notice Hanya bisa dipanggil sekali (setelah CarNFT di-deploy).
    function setCarNFT(address c) external onlyOwner {
        if (address(carNFT) != address(0)) revert CarNFTAlreadySet();
        carNFT = ICarNFT(c);
    }
}
