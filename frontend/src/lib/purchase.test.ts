import { describe, expect, it, vi } from 'vitest';
import { decodeFunctionData, encodeErrorResult, parseAbi } from 'viem';
import { CARS, monToWei } from '@racing-gang/config';
import type { VoucherResponse } from '@racing-gang/config/protocol';
import { ApiError } from './api';
import { buildBuyCall, carNftAbiProblems, PurchaseFlow, readPending, revertName, supplyStatus, walletErrorKind, writePending, type PurchaseDeps } from './purchase';

// Test-only ABI written from TECH_SPEC §6.2 to exercise validation/encoding. Production reads the deployed ABI.
const specAbi = parseAbi([
  'function buy((address buyer,uint8 tier,uint32 coinCost,uint256 nonce,uint64 expiry) v, bytes sig) payable',
  'function minted(uint8 tier) view returns (uint256)',
  'function ownsTier(address owner, uint8 tier) view returns (bool)',
  'error SoldOut()',
  'error VoucherUsed()',
]);
const A = '0xF1359B00178B8cC52Dc4950ad75Fa0f57D535D30' as const;
const B = '0x2222222222222222222222222222222222222222' as const;
const NFT = '0x4444444444444444444444444444444444444444' as const;
const HASH = `0x${'ab'.repeat(32)}` as const;
const NOW = 1_800_000_000_000;
const voucher = (over: Partial<VoucherResponse['voucher']> = {}): VoucherResponse => {
  const v = { buyer: A, tier: 1, coinCost: CARS[1]!.coinCost, nonce: '123', expiry: NOW / 1000 + 300, ...over };
  return { voucher: v, signature: `0x${'11'.repeat(65)}`, expiresAt: v.expiry * 1000 };
};
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };

function setup(over: Partial<PurchaseDeps> & { walletOver?: Partial<PurchaseDeps['wallet']>; chainOver?: Partial<PurchaseDeps['chain']> } = {}) {
  const store = memory();
  const sent: unknown[] = [];
  let owned: number[] = [];
  const deps: PurchaseDeps = {
    address: A, tier: 1, store, now: () => NOW, sleep: async () => {}, syncAttempts: 3, syncIntervalMs: 0,
    reserve: vi.fn(async () => voucher()),
    buildCall: v => buildBuyCall(specAbi, NFT, v),
    wallet: { address: () => A, switchChain: vi.fn(async () => {}), balance: async () => 10n ** 18n, send: vi.fn(async c => { sent.push(c); return HASH; }), ...over.walletOver },
    chain: { simulate: async () => null, receipt: async () => { owned = [1]; return 'success'; }, owns: async () => owned.includes(1), ...over.chainOver },
    refreshOwned: vi.fn(async () => owned),
    ...over,
  };
  return { flow: new PurchaseFlow(deps), deps, store, sent, setOwned: (t: number[]) => { owned = t; } };
}

describe('CarNFT ABI and encoding', () => {
  it('accepts the spec ABI and rejects missing or mismatched ABIs instead of guessing', () => {
    expect(carNftAbiProblems(specAbi)).toEqual([]);
    expect(carNftAbiProblems([])).toHaveLength(3);
    expect(carNftAbiProblems(parseAbi(['function buy((address buyer,uint8 tier,uint32 coinCost,uint256 nonce,uint64 expiry) v, bytes sig)', 'function minted(uint8) view returns (uint256)', 'function ownsTier(address,uint8) view returns (bool)']))).toHaveLength(1); // not payable
  });
  it('encodes buy(voucher, sig) with value = config price, and decodes custom errors with the ABI', () => {
    const call = buildBuyCall(specAbi, NFT, voucher());
    expect(call.to).toBe(NFT);
    expect(call.value).toBe(monToWei(CARS[1]!.priceMon));
    const decoded = decodeFunctionData({ abi: specAbi, data: call.data });
    expect(decoded.functionName).toBe('buy');
    expect(decoded.args[0]).toMatchObject({ buyer: A, tier: 1, nonce: 123n });
    expect(revertName(specAbi, encodeErrorResult({ abi: specAbi, errorName: 'SoldOut' }))).toBe('SoldOut');
    expect(revertName(specAbi, '0xdeadbeef')).toBeNull();
  });
  it('computes supply left and sold out from minted', () => {
    expect(supplyStatus(1, null)).toMatchObject({ left: null, soldOut: false });
    expect(supplyStatus(1, BigInt(CARS[1]!.supply - 1))).toMatchObject({ left: 1n, soldOut: false });
    expect(supplyStatus(1, BigInt(CARS[1]!.supply))).toMatchObject({ left: 0n, soldOut: true });
  });
  it('classifies wallet errors', () => {
    expect(walletErrorKind({ code: 4001 })).toBe('rejected');
    expect(walletErrorKind(new Error('User rejected the request.'))).toBe('rejected');
    expect(walletErrorKind(new Error('insufficient funds for gas * price + value'))).toBe('insufficient_funds');
    expect(walletErrorKind(new Error('socket hang up'))).toBe('unknown');
  });
});

describe('PurchaseFlow', () => {
  it('happy path: reserve → switch → dry run → wallet → receipt → owned only after /me says so', async () => {
    const t = setup();
    await t.flow.buy();
    expect(t.flow.state).toEqual({ step: 'done', hash: HASH });
    expect(t.sent).toHaveLength(1);
    expect(t.deps.refreshOwned).toHaveBeenCalled();
    expect(readPending(t.store, A, 1)).toBeNull();
  });
  it('double click sends one transaction', async () => {
    const t = setup();
    await Promise.all([t.flow.buy(), t.flow.buy()]);
    expect(t.sent).toHaveLength(1);
    expect(t.deps.reserve).toHaveBeenCalledTimes(1);
  });
  it('user rejection: nothing sent, retry allowed', async () => {
    const t = setup({ walletOver: { send: async () => { throw Object.assign(new Error('User rejected'), { code: 4001 }); } } });
    await t.flow.buy();
    expect(t.flow.state).toMatchObject({ step: 'error', kind: 'rejected', retry: true });
    expect(readPending(t.store, A, 1)).toBeNull();
  });
  it('known revert from the dry run stops before the wallet prompt', async () => {
    const t = setup({ chainOver: { simulate: async () => 'SoldOut' } });
    await t.flow.buy();
    expect(t.flow.state).toMatchObject({ step: 'error', kind: 'reverted', message: 'This car is sold out.' });
    expect(t.sent).toHaveLength(0);
  });
  it('on-chain revert after broadcast: not owned, pending cleared, no debit claimed', async () => {
    const t = setup({ chainOver: { receipt: async () => 'reverted' } });
    await t.flow.buy();
    expect(t.flow.state).toMatchObject({ step: 'error', kind: 'reverted', hash: HASH });
    expect(readPending(t.store, A, 1)).toBeNull();
  });
  it('expired or nearly expired voucher never reaches the wallet', async () => {
    const t = setup({ reserve: async () => voucher({ expiry: NOW / 1000 + 10 }) });
    await t.flow.buy();
    expect(t.flow.state).toMatchObject({ step: 'error', kind: 'expired' });
    expect(t.sent).toHaveLength(0);
  });
  it('insufficient MON is caught before the wallet prompt', async () => {
    const t = setup({ walletOver: { balance: async () => 1n } });
    await t.flow.buy();
    expect(t.flow.state).toMatchObject({ step: 'error', kind: 'insufficient_funds' });
    expect(t.sent).toHaveLength(0);
  });
  it('wallet network switch declined', async () => {
    const t = setup({ walletOver: { switchChain: async () => { throw Object.assign(new Error('rejected'), { code: 4001 }); } } });
    await t.flow.buy();
    expect(t.flow.state).toMatchObject({ step: 'error', kind: 'wrong_chain' });
  });
  it('wallet address different from the game account is blocked', async () => {
    const t = setup({ walletOver: { address: () => B } });
    await t.flow.buy();
    expect(t.flow.state).toMatchObject({ step: 'error', kind: 'blocked' });
    expect(t.deps.reserve).not.toHaveBeenCalled();
  });
  it('ambiguous reservation POST → unknown, no automatic retry', async () => {
    const t = setup({ reserve: async () => { throw new ApiError('x', 'UNKNOWN_OUTCOME'); } });
    await t.flow.buy();
    expect(t.flow.state.step).toBe('unknown');
    await t.flow.buy(); // ignored until reconciled
    expect(t.sent).toHaveLength(0);
  });
  it('ambiguous broadcast → unknown; check() reconciles via on-chain ownership without re-sending', async () => {
    const t = setup({ walletOver: { send: async () => { throw new Error('socket hang up'); } } });
    await t.flow.buy();
    expect(t.flow.state.step).toBe('unknown');
    t.setOwned([1]);
    await t.flow.check();
    expect(t.flow.state).toMatchObject({ step: 'done' });
  });
  it('receipt timeout keeps the hash; reload resumes it and never re-sends', async () => {
    const t = setup({ chainOver: { receipt: async () => { throw new Error('timeout'); } } });
    await t.flow.buy();
    expect(t.flow.state).toMatchObject({ step: 'unknown', hash: HASH });
    expect(readPending(t.store, A, 1)?.hash).toBe(HASH);
    // "Reload": new flow on the same storage
    let owned: number[] = [];
    const again = new PurchaseFlow({ ...t.deps, chain: { ...t.deps.chain, receipt: async () => { owned = [1]; return 'success'; } }, refreshOwned: async () => owned });
    expect(again.resume()).toBe(true);
    await vi.waitFor(() => expect(again.state.step).toBe('done'));
    expect(t.sent).toHaveLength(1);
    // A pending tx also blocks a fresh buy from re-sending.
    writePending(t.store, A, { hash: HASH, tier: 1, nonce: '1', expiry: 1, at: 1 });
    const third = new PurchaseFlow({ ...t.deps, chain: { ...t.deps.chain, receipt: () => new Promise(() => {}) } });
    await third.buy();
    expect(third.state).toEqual({ step: 'pending', hash: HASH });
    expect(t.sent).toHaveLength(1);
  });
  it('receipt success but indexer slow → synced_late (no local ownership claim)', async () => {
    const t = setup({ refreshOwned: async () => [] });
    await t.flow.buy();
    expect(t.flow.state).toEqual({ step: 'synced_late', hash: HASH });
  });
  it('account switch: disposed flow ignores late results; pending records are per account', async () => {
    let release!: (h: `0x${string}`) => void;
    const t = setup({ walletOver: { send: () => new Promise(r => { release = r; }) } });
    const run = t.flow.buy();
    await vi.waitFor(() => expect(t.flow.state.step).toBe('wallet'));
    t.flow.dispose();
    release(HASH);
    await run;
    expect(t.flow.state.step).toBe('wallet');
    expect(readPending(t.store, B, 1)).toBeNull();
  });
});
