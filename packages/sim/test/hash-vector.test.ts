import { describe, expect, it } from 'vitest';
import { keccak256, toHex } from 'viem';
import { EntryKind } from '@racing-gang/config';
import { appendHash, initialHash } from '../src/hash';

// Vektor yang sama dikunci di contract/test/HashChain.t.sol: hash Solidity harus identik (BACKEND_PLAN D3).
describe('hash chain: vektor tetap bersama Forge', () => {
  it('initialHash + 3 entri → nilai tetap', () => {
    const runId = keccak256(toHex('racing-gang/hash-vector/run'));
    const seed = keccak256(toHex('racing-gang/hash-vector/seed'));

    let h = initialHash(runId, seed);
    expect(h).toBe('0xa3fae1ba9283d8ed35229e41059d867142baf8d505f679461b24617b5a07ea0e');

    h = appendHash(h, { tick: 1, kind: EntryKind.LEFT, data: 0 });
    expect(h).toBe('0x73b17593cb0df98c601d7afa4dce163269a9b1edcb1b38837871efa5aad23f18');

    h = appendHash(h, { tick: 2, kind: EntryKind.SPEC_RED, data: 2 | (1 << 8) });
    expect(h).toBe('0xfb3c6ff4842a9d8793989e94f1cac3ce5cd9420c78ce33c63844e208ae3d5afc');

    h = appendHash(h, { tick: 3000, kind: EntryKind.BRAKE_ON, data: 0 });
    expect(h).toBe('0x2b1e0b6c37d383ee886510552a520135ca10807b638627244aa62c523fb84fed');
  });
});
