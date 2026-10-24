// Rumus yang sama dengan kontrak RunRegistry (TECH_SPEC §5.2, §6.1).
import { encodeAbiParameters, encodePacked, keccak256 } from 'viem';
import type { Address, Hex } from '@racing-gang/config/protocol';

export const computeRunId = (player: Address, serverNonce: bigint): Hex =>
  keccak256(encodePacked(['address', 'uint64'], [player, serverNonce]));

export const computeSeed = (blockHash: Hex, runId: Hex, player: Address): Hex =>
  keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'address' }], [blockHash, runId, player]));
