import { describe, expect, it } from 'vitest';
import { recoverTypedDataAddress, zeroAddress } from 'viem';
import { MockChain, mockBlockHash } from '../src/chain/mock';
import type { ChainEvent } from '../src/chain/ports';
import { computeRunId, computeSeed } from '../src/chain/seed';
import { voucherDomain, voucherTypes } from '../src/chain/voucherTypes';
import { fakeClock, testAccount } from './helpers';

function setup() {
  const clock = fakeClock();
  const chain = new MockChain({ chainId: 10143, now: clock.now, intervalMs: 0 });
  const events: ChainEvent[] = [];
  chain.bus.on((e) => void events.push(e));
  return { chain, clock, events };
}

const player = testAccount('p').address;
const runId = computeRunId(player, 1n);
const nm = (index: number) => ({ runId, index, tick: index * 10, vehicleType: 0, vehicleId: index, inputHash: `0x${'00'.repeat(32)}` as const });

describe('MockChain', () => {
  it('nomor blok maju tiap 400 ms', () => {
    const { chain, clock } = setup();
    const b0 = chain.blockNumber();
    clock.advance(1000);
    expect(chain.blockNumber()).toBe(b0 + 2n);
  });

  it('RunStarted membawa seed dengan rumus kontrak', async () => {
    const { chain, events } = setup();
    chain.relayer.enqueueStart({ runId, player, carTier: 0, seedBlock: 5n, configVersion: 1 });
    await chain.flush();
    expect(events[0]).toMatchObject({ type: 'RunStarted', runId, seed: computeSeed(mockBlockHash(5n), runId, player) });
  });

  it('mepet dicatat berurutan; duplikat dilewati; yang loncat menunggu', async () => {
    const { chain, events } = setup();
    chain.relayer.enqueueStart({ runId, player, carTier: 0, seedBlock: 1n, configVersion: 1 });
    chain.relayer.enqueueNearMiss(nm(2));
    chain.relayer.enqueueNearMiss(nm(1));
    chain.relayer.enqueueNearMiss(nm(1));
    chain.relayer.enqueueNearMiss(nm(4));
    await chain.flush();
    expect(events.filter((e) => e.type === 'NearMiss').map((e) => (e.type === 'NearMiss' ? e.index : 0))).toEqual([1, 2]);
    expect(chain.relayer.queueSize()).toBe(1); // index 4 menunggu index 3
    chain.relayer.enqueueNearMiss(nm(3));
    await chain.flush();
    expect(events.filter((e) => e.type === 'NearMiss').length).toBe(4);
  });

  it('Qualified tepat pada mepet ke-40 untuk Starter; RunEnded setelah semua mepet tercatat', async () => {
    const { chain, events } = setup();
    chain.relayer.enqueueStart({ runId, player, carTier: 0, seedBlock: 1n, configVersion: 1 });
    chain.relayer.enqueueEnd({ runId, reason: 1, endTick: 500, totalNearMisses: 40, finalInputHash: `0x${'00'.repeat(32)}` });
    for (let i = 1; i <= 40; i++) chain.relayer.enqueueNearMiss(nm(i));
    await chain.flush();
    const q = events.filter((e) => e.type === 'Qualified');
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ tier: 1, tick: 400 });
    expect(await chain.reads.isQualified(player, 1)).toBe(true);
    expect(events.at(-1)?.type).toBe('RunEnded');
  });

  it('voucher ditandatangani dengan domain RacingGangCars', async () => {
    const key = `0x${'ab'.repeat(32)}` as const;
    const chain = new MockChain({ chainId: 10143, voucherSignerKey: key, intervalMs: 0 });
    const message = { buyer: player, tier: 1, coinCost: 3000, nonce: 7n, expiry: 123n };
    const sig = await chain.voucher.sign(message);
    const signer = await recoverTypedDataAddress({ domain: voucherDomain(10143, zeroAddress), types: voucherTypes, primaryType: 'Voucher', message, signature: sig });
    expect(signer).toBe(chain.voucher.address);
  });
});
