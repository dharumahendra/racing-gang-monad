// Hash chain log input (TECH_SPEC §3.8). Harus identik dengan keccak256(abi.encodePacked(...)) di Solidity.
import { encodePacked, keccak256 } from 'viem';
import type { Hex, LogEntry } from './types';

export function initialHash(runId: Hex, seed: Hex): Hex {
  return keccak256(encodePacked(['bytes32', 'bytes32'], [runId, seed]));
}

export function appendHash(h: Hex, e: Pick<LogEntry, 'tick' | 'kind' | 'data'>): Hex {
  return keccak256(encodePacked(['bytes32', 'uint16', 'uint8', 'uint32'], [h, e.tick, e.kind, e.data]));
}
