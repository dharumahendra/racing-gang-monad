// Car purchase flow (TECH_SPEC §6.2, §6.3, §8.4): reservation (POST /vouchers) → Privy wallet → CarNFT.buy()
// → receipt → refresh /me. Ownership shown in the UI always comes from /me (indexer), never from this module.
// The contract ABI is taken only from packages/config/deployments (written by the deploy script); if it is missing
// or does not match the spec signature, purchasing stays blocked instead of guessing an encoding.
import { CARS, monToWei } from '@racing-gang/config';
import type { Address, Hex, VoucherResponse } from '@racing-gang/config/protocol';
import { decodeErrorResult, encodeFunctionData, type Abi } from 'viem';
import { ApiError } from './api';

type AbiParam = { name?: string; type: string; components?: readonly AbiParam[] };
type AbiFn = { type: string; name?: string; stateMutability?: string; inputs?: readonly AbiParam[]; outputs?: readonly AbiParam[] };
const fn = (abi: readonly unknown[], name: string) => (abi as AbiFn[]).find(e => e?.type === 'function' && e.name === name);
const types = (p: readonly AbiParam[] | undefined) => (p ?? []).map(x => x.type).join(',');

/** Checks the deployed CarNFT ABI against the spec instead of inventing one. Returns the missing pieces. */
export function carNftAbiProblems(abi: readonly unknown[]): string[] {
  const problems: string[] = [];
  const buy = fn(abi, 'buy');
  const voucher = buy?.inputs?.[0];
  const fields = (voucher?.components ?? []).map(c => `${c.name}:${c.type}`).join(',');
  if (!buy || buy.stateMutability !== 'payable' || buy.inputs?.length !== 2 || voucher?.type !== 'tuple' || buy.inputs[1]?.type !== 'bytes'
    || fields !== 'buyer:address,tier:uint8,coinCost:uint32,nonce:uint256,expiry:uint64') problems.push('buy((address buyer,uint8 tier,uint32 coinCost,uint256 nonce,uint64 expiry),bytes) payable');
  const minted = fn(abi, 'minted');
  if (!minted || types(minted.inputs) !== 'uint8' || types(minted.outputs) !== 'uint256') problems.push('minted(uint8) view returns (uint256)');
  const owns = fn(abi, 'ownsTier');
  if (!owns || types(owns.inputs) !== 'address,uint8' || types(owns.outputs) !== 'bool') problems.push('ownsTier(address,uint8) view returns (bool)');
  return problems;
}

export type BuyCall = { to: Address; data: Hex; value: bigint };
export function buildBuyCall(abi: Abi, carNFT: Address, v: VoucherResponse): BuyCall {
  const { buyer, tier, coinCost, nonce, expiry } = v.voucher;
  const data = encodeFunctionData({ abi, functionName: 'buy', args: [{ buyer, tier, coinCost, nonce: BigInt(nonce), expiry: BigInt(expiry) }, v.signature] });
  return { to: carNFT, data, value: monToWei(CARS[tier]!.priceMon) };
}

/** Supply from shared config (immutable in the contract per spec) vs on-chain minted count. */
export function supplyStatus(tier: number, minted: bigint | null) {
  const supply = BigInt(CARS[tier]?.supply ?? 0);
  if (minted === null) return { supply, minted: null, left: null, soldOut: false };
  const left = minted >= supply ? 0n : supply - minted;
  return { supply, minted, left, soldOut: left === 0n };
}

const REVERT_MESSAGES: Record<string, string> = {
  NotQualified: 'This account hasn\u2019t met the near-miss requirement on-chain yet.',
  WrongPrice: 'The MON price doesn\u2019t match the contract.',
  SoldOut: 'This car is sold out.',
  AlreadyOwned: 'This account already owns this car.',
  VoucherExpired: 'The voucher expired. Request a new one.',
  VoucherUsed: 'This voucher was already used.',
  BadSignature: 'The voucher signature was rejected by the contract.',
  WrongBuyer: 'The voucher belongs to a different account.',
  BadTier: 'Invalid car tier.',
};
/** Name of a custom error from revert data, decoded only with the deployed ABI. */
export function revertName(abi: Abi, data: unknown): string | null {
  if (typeof data !== 'string' || !/^0x[\da-f]{8}/i.test(data)) return null;
  try { return decodeErrorResult({ abi, data: data as Hex }).errorName; } catch { return null; }
}
export const revertMessage = (name: string | null) => (name && REVERT_MESSAGES[name]) || 'The contract rejected the purchase.';

export type WalletErrorKind = 'rejected' | 'wrong_chain' | 'insufficient_funds' | 'unknown';
export function walletErrorKind(error: unknown): WalletErrorKind {
  const e = error as { code?: number; cause?: { code?: number }; name?: string; message?: string; shortMessage?: string } | null;
  const code = e?.code ?? e?.cause?.code;
  const text = `${e?.name ?? ''} ${e?.shortMessage ?? ''} ${e?.message ?? ''}`.toLowerCase();
  if (code === 4001 || /user rejected|user denied|rejected the request|cancel/.test(text)) return 'rejected';
  if (code === 4902 || /chain mismatch|unsupported chain|wrong network|does not match the target chain/.test(text)) return 'wrong_chain';
  if (/insufficient funds|exceeds balance|insufficient balance/.test(text)) return 'insufficient_funds';
  return 'unknown';
}

/** Minimal record kept across reloads so a broadcast transaction is reconciled instead of re-sent. No tokens/secrets. */
export type PendingPurchase = { hash: Hex; tier: number; nonce: string; expiry: number; at: number };
type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
const pendingKey = (address: string, tier: number) => `racing-gang:purchase:${address.toLowerCase()}:${tier}`;
export function readPending(store: KV, address: string, tier: number): PendingPurchase | null {
  try {
    const raw = JSON.parse(store?.getItem(pendingKey(address, tier)) ?? 'null');
    return raw && /^0x[\da-f]{64}$/i.test(raw.hash) && raw.tier === tier && typeof raw.nonce === 'string' && Number.isSafeInteger(raw.expiry) ? raw : null;
  } catch { return null; }
}
export function writePending(store: KV, address: string, p: PendingPurchase) { try { store?.setItem(pendingKey(address, p.tier), JSON.stringify(p)); } catch { /* blocked storage: reload loses the hash, ownership still syncs via /me */ } }
export function clearPending(store: KV, address: string, tier: number) { try { store?.removeItem(pendingKey(address, tier)); } catch { /* ignore */ } }

export type PurchaseState =
  | { step: 'idle' }
  | { step: 'reserving' }
  | { step: 'switching' }
  | { step: 'checking' }
  | { step: 'wallet' }
  | { step: 'pending'; hash: Hex }
  | { step: 'syncing'; hash?: Hex }
  | { step: 'done'; hash?: Hex }
  | { step: 'synced_late'; hash?: Hex }
  | { step: 'error'; kind: 'rejected' | 'reverted' | 'expired' | 'wrong_chain' | 'insufficient_funds' | 'reservation' | 'blocked'; message: string; hash?: Hex; retry: boolean }
  | { step: 'unknown'; message: string; hash?: Hex };

export type PurchaseDeps = {
  address: Address;
  tier: number;
  reserve: (signal: AbortSignal) => Promise<VoucherResponse>;
  wallet: {
    address: () => Address | null;
    switchChain: () => Promise<void>;
    balance: () => Promise<bigint>;
    send: (call: BuyCall) => Promise<Hex>;
  };
  chain: {
    /** eth_call dry run; resolves to a decoded custom error name, or null if the call would succeed. */
    simulate: (call: BuyCall, from: Address) => Promise<string | null>;
    /** Waits for the receipt; 'reverted' with optional error name. */
    receipt: (hash: Hex) => Promise<'success' | 'reverted'>;
    owns: () => Promise<boolean>;
  };
  buildCall: (v: VoucherResponse) => BuyCall;
  /** Refreshes /me; resolves to owned tiers, or null if unavailable. */
  refreshOwned: () => Promise<number[] | null>;
  store: KV;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Indexer catch-up polling after a successful receipt. */
  syncAttempts?: number;
  syncIntervalMs?: number;
};

/** Seconds of voucher validity required before asking the wallet (signing + inclusion). */
export const EXPIRY_MARGIN_S = 45;

export class PurchaseFlow {
  state: PurchaseState = { step: 'idle' };
  private generation = 0;
  private controller: AbortController | null = null;
  private listeners = new Set<() => void>();
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(private deps: PurchaseDeps) {
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private set(state: PurchaseState, gen: number) { if (gen !== this.generation) return false; this.state = state; for (const l of this.listeners) l(); return true; }
  get busy() { return ['reserving', 'switching', 'checking', 'wallet', 'pending', 'syncing'].includes(this.state.step); }

  /** Resume a transaction broadcast before a reload or tab close. Never re-sends. */
  resume() {
    const pending = readPending(this.deps.store, this.deps.address, this.deps.tier);
    if (!pending || this.busy) return false;
    const gen = ++this.generation;
    this.set({ step: 'pending', hash: pending.hash }, gen);
    void this.confirm(pending.hash, gen);
    return true;
  }

  async buy() {
    if (this.busy || this.state.step === 'unknown') return;
    if (readPending(this.deps.store, this.deps.address, this.deps.tier)) { this.resume(); return; }
    const gen = ++this.generation;
    const { address, tier } = this.deps;
    const alive = () => gen === this.generation;
    const walletAddress = this.deps.wallet.address();
    if (!walletAddress || walletAddress.toLowerCase() !== address.toLowerCase()) {
      this.set({ step: 'error', kind: 'blocked', message: 'The connected wallet doesn\u2019t match this game account. Sign in again.', retry: false }, gen); return;
    }
    // 1. Reservation (idempotent server-side per buyer+tier while active).
    this.set({ step: 'reserving' }, gen);
    this.controller = new AbortController();
    let voucher: VoucherResponse;
    try { voucher = await this.deps.reserve(this.controller.signal); }
    catch (e) {
      if (!alive()) return;
      const code = e instanceof ApiError ? e.code : '';
      if (code === 'UNKNOWN_OUTCOME' || code === 'INVALID_RESPONSE') this.set({ step: 'unknown', message: 'Reservation status unknown. Check status before trying again; the server reuses an active reservation.' }, gen);
      else this.set({ step: 'error', kind: 'reservation', message: e instanceof Error ? e.message : 'Couldn\u2019t reserve coins.', retry: code !== 'ALREADY_OWNED' && code !== 'SOLD_OUT' && code !== 'NOT_QUALIFIED' }, gen);
      return;
    }
    if (!alive()) return;
    if (voucher.voucher.buyer.toLowerCase() !== address.toLowerCase() || voucher.voucher.tier !== tier) {
      this.set({ step: 'error', kind: 'blocked', message: 'Voucher doesn\u2019t match this account or car.', retry: false }, gen); return;
    }
    const expired = () => voucher.voucher.expiry * 1000 - this.now() < EXPIRY_MARGIN_S * 1000;
    if (expired()) { this.set({ step: 'error', kind: 'expired', message: 'The voucher is about to expire. Request a new one.', retry: true }, gen); return; }
    // 2. Network.
    this.set({ step: 'switching' }, gen);
    try { await this.deps.wallet.switchChain(); }
    catch (e) { if (alive()) this.set({ step: 'error', kind: 'wrong_chain', message: walletErrorKind(e) === 'rejected' ? 'Network switch was declined. Switch to Monad testnet to buy.' : 'Couldn\u2019t switch the wallet to Monad testnet.', retry: true }, gen); return; }
    if (!alive()) return;
    // 3. Dry run + balance, so a known revert or empty wallet doesn't cost gas.
    this.set({ step: 'checking' }, gen);
    const call = this.deps.buildCall(voucher);
    try {
      const [revert, balance] = await Promise.all([this.deps.chain.simulate(call, address), this.deps.wallet.balance()]);
      if (!alive()) return;
      if (revert) { this.set({ step: 'error', kind: 'reverted', message: revertMessage(revert), retry: revert === 'VoucherExpired' }, gen); return; }
      if (balance < call.value) { this.set({ step: 'error', kind: 'insufficient_funds', message: `Not enough MON. You need ${CARS[tier]!.priceMon} MON plus gas.`, retry: true }, gen); return; }
    } catch {
      if (!alive()) return;
      this.set({ step: 'error', kind: 'blocked', message: 'Couldn\u2019t reach the Monad RPC to check the purchase. Try again.', retry: true }, gen); return;
    }
    if (expired()) { this.set({ step: 'error', kind: 'expired', message: 'The voucher expired while checking. Request a new one.', retry: true }, gen); return; }
    // 4. Wallet approval + broadcast.
    this.set({ step: 'wallet' }, gen);
    let hash: Hex;
    try { hash = await this.deps.wallet.send(call); }
    catch (e) {
      if (!alive()) return;
      const kind = walletErrorKind(e);
      if (kind === 'rejected') this.set({ step: 'error', kind: 'rejected', message: 'You declined the transaction. Nothing was charged.', retry: true }, gen);
      else if (kind === 'insufficient_funds') this.set({ step: 'error', kind: 'insufficient_funds', message: 'Not enough MON for the price plus gas.', retry: true }, gen);
      else if (kind === 'wrong_chain') this.set({ step: 'error', kind: 'wrong_chain', message: 'Wallet is on the wrong network. Switch to Monad testnet.', retry: true }, gen);
      // Anything else may have been broadcast: reconcile on-chain before allowing another attempt.
      else this.set({ step: 'unknown', message: 'Transaction status unknown. Check status before trying again.' }, gen);
      return;
    }
    writePending(this.deps.store, address, { hash, tier, nonce: voucher.voucher.nonce, expiry: voucher.voucher.expiry, at: this.now() });
    if (!this.set({ step: 'pending', hash }, gen)) return;
    await this.confirm(hash, gen);
  }

  private async confirm(hash: Hex, gen: number) {
    const alive = () => gen === this.generation;
    let status: 'success' | 'reverted';
    try { status = await this.deps.chain.receipt(hash); }
    catch {
      // Hash stays stored: the next check or reload resumes it. No resend.
      if (alive()) this.set({ step: 'unknown', hash, message: 'Waiting for the receipt timed out. The transaction may still confirm; check status again.' }, gen);
      return;
    }
    if (!alive()) return;
    if (status === 'reverted') {
      clearPending(this.deps.store, this.deps.address, this.deps.tier);
      // Reserved coins are released by the server once the voucher expires; no debit happens without a Purchased event.
      this.set({ step: 'error', kind: 'reverted', hash, message: 'The transaction reverted on-chain. No car was minted; reserved coins are released when the voucher expires.', retry: true }, gen);
      return;
    }
    clearPending(this.deps.store, this.deps.address, this.deps.tier);
    this.set({ step: 'syncing', hash }, gen);
    await this.sync(hash, gen);
  }

  private async sync(hash: Hex | undefined, gen: number) {
    const attempts = this.deps.syncAttempts ?? 30, interval = this.deps.syncIntervalMs ?? 2000;
    for (let i = 0; i < attempts; i++) {
      if (gen !== this.generation) return;
      const owned = await this.deps.refreshOwned().catch(() => null);
      if (gen !== this.generation) return;
      if (owned?.includes(this.deps.tier)) { this.set({ step: 'done', hash }, gen); return; }
      await this.sleep(interval);
    }
    this.set({ step: 'synced_late', hash }, gen);
  }

  /** Reconcile an ambiguous outcome: stored hash → receipt; otherwise on-chain ownership. Never re-sends. */
  async check() {
    if (this.busy) return;
    const pending = readPending(this.deps.store, this.deps.address, this.deps.tier);
    const gen = ++this.generation;
    if (pending) { this.set({ step: 'pending', hash: pending.hash }, gen); await this.confirm(pending.hash, gen); return; }
    const last = this.state.step === 'synced_late' || this.state.step === 'unknown' ? (this.state as { hash?: Hex }).hash : undefined;
    this.set({ step: 'checking' }, gen);
    try {
      if (await this.deps.chain.owns()) { this.set({ step: 'syncing', hash: last }, gen); await this.sync(last, gen); return; }
      if (gen === this.generation) this.set({ step: 'idle' }, gen);
    } catch {
      if (gen === this.generation) this.set({ step: 'unknown', hash: last, message: 'Couldn\u2019t reach the Monad RPC. Check status again later.' }, gen);
    }
  }

  /** Account switch / unmount: late results from this flow are ignored. */
  dispose() { this.generation++; this.controller?.abort(); this.listeners.clear(); }
}
