// ABI kontrak yang dipakai backend (TECH_SPEC §6.1–6.2). Ditulis tangan supaya bertipe dan tetap ada
// sebelum deploy; test `abi.test.ts` mencocokkannya dengan artifact Foundry kalau `contract/out` ada.
import { parseAbi } from 'viem';

export const runRegistryAbi = parseAbi([
  'struct StartRec { bytes32 runId; address player; uint8 carTier; uint64 seedBlock; uint16 configVersion; }',
  'struct NearMissRec { bytes32 runId; uint16 index; uint16 tick; uint8 vehicleType; uint32 vehicleId; bytes32 inputHash; }',
  'struct EndRec { bytes32 runId; uint8 reason; uint16 endTick; uint16 totalNearMisses; bytes32 finalInputHash; }',
  'struct Run { address player; uint8 carTier; uint16 configVersion; bool ended; uint8 endReason; uint16 nearMisses; uint16 lastTick; uint64 startBlock; bytes32 seed; }',
  'function submitBatch(StartRec[] s, NearMissRec[] n, EndRec[] e)',
  'function getRun(bytes32 runId) view returns (Run)',
  'function isQualified(address player, uint8 tier) view returns (bool)',
  'function qualifyingRun(address player, uint8 tier) view returns (bytes32)',
  'event RunStarted(bytes32 indexed runId, address indexed player, uint8 carTier, bytes32 seed, uint64 seedBlock, uint16 configVersion)',
  'event NearMiss(bytes32 indexed runId, address indexed player, uint16 index, uint16 tick, uint8 vehicleType, uint32 vehicleId, bytes32 inputHash)',
  'event RunEnded(bytes32 indexed runId, uint8 reason, uint16 endTick, uint16 totalNearMisses, bytes32 finalInputHash)',
  'event Qualified(address indexed player, uint8 indexed tier, bytes32 runId, uint16 tick)',
  'error NotAttester()',
  'error RunExists()',
  'error UnknownRun()',
  'error RunAlreadyEnded()',
  'error IndexGap()',
  'error TickOutOfRange()',
  'error RunTooOld()',
  'error SeedBlockInvalid()',
  'error CarNotOwned()',
  'error CountMismatch()',
  'error CarNFTAlreadySet()',
  'error InvalidConfig()',
]);

export const carNftAbi = parseAbi([
  'struct Voucher { address buyer; uint8 tier; uint32 coinCost; uint256 nonce; uint64 expiry; }',
  'function buy(Voucher v, bytes sig) payable',
  'function ownsTier(address owner, uint8 tier) view returns (bool)',
  'function minted(uint8 tier) view returns (uint256)',
  'function price(uint8 tier) view returns (uint256)',
  'function voucherSigner() view returns (address)',
  'event Purchased(address indexed buyer, uint8 indexed tier, uint256 tokenId, uint256 voucherNonce, uint32 coinCost, bytes32 runId)',
]);
