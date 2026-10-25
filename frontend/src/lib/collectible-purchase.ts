// Pembelian RGX langsung dari wallet. Tidak memakai voucher, koin game, atau cache /me.
import { COLLECTIBLES, type CollectiblesDeployment } from '@racing-gang/config';
import { encodeFunctionData, type Abi, type Address, type Hex } from 'viem';
import { walletErrorKind } from './purchase';

type AbiFunction = { type?: string; name?: string; stateMutability?: string; inputs?: { type: string }[]; outputs?: { type: string }[] };
export function collectiblesAbiProblems(abi: readonly unknown[]) {
  const entries = abi as AbiFunction[];
  return [
    ['buy', 'uint8', '', 'payable'], ['price', 'uint8', 'uint256', 'view'],
    ['supply', 'uint8', 'uint256', 'view'], ['minted', 'uint8', 'uint256', 'view'],
    ['ownsDesign', 'address,uint8', 'bool', 'view'],
  ].filter(([name, input, output, mutability]) => !entries.some(fn => fn?.type === 'function' && fn.name === name &&
    (fn.inputs ?? []).map(p => p.type).join(',') === input && (fn.outputs ?? []).map(p => p.type).join(',') === output && fn.stateMutability === mutability))
    .map(([name]) => name);
}

export type CollectibleCall = { to: Address; data: Hex; value: bigint };
export type DesignState = { price: bigint; supply: bigint; minted: bigint; owned: boolean };
export function buildCollectibleCall(deployment: CollectiblesDeployment, design: number, price: bigint): CollectibleCall {
  if (collectiblesAbiProblems(deployment.abi).length || !COLLECTIBLES.some(d => d.id === design) || price < 0n) throw new Error('Invalid RGX deployment or design');
  return { to: deployment.collectibles, value: price, data: encodeFunctionData({ abi: deployment.abi as Abi, functionName: 'buy', args: [design] }) };
}

export type CollectibleState =
  | { step: 'idle' | 'switching' | 'checking' | 'wallet' }
  | { step: 'pending'; hash: Hex }
  | { step: 'done'; hash?: Hex }
  | { step: 'unknown'; hash?: Hex; message: string }
  | { step: 'error'; hash?: Hex; message: string; retry: boolean };
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
export type CollectibleDeps = {
  chainId: number; contract: Address; address: Address; design: number; store: Store;
  build: (price: bigint) => CollectibleCall;
  wallet: { address: () => Address | null; switchChain: () => Promise<void>; balance: () => Promise<bigint>; send: (call: CollectibleCall & { gas: bigint; gasPrice?: bigint }) => Promise<Hex> };
  chain: { read: () => Promise<DesignState>; prepare: (call: CollectibleCall) => Promise<{ gas: bigint; gasCost: bigint; gasPrice?: bigint }>; receipt: (hash: Hex) => Promise<'success' | 'reverted'> };
};
type Record = { at: number; hash?: Hex };
export class CollectibleError extends Error {}

// Hanya penolakan wallet yang pasti tidak mengirim transaksi; "request canceled" bisa berarti jaringan putus.
function walletRejected(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 8 && current && typeof current === 'object'; depth++) {
    const value = current as { code?: unknown; name?: string; cause?: unknown };
    if (value.code === 4001 || value.code === 'ACTION_REJECTED' || value.name === 'UserRejectedRequestError') return true;
    current = value.cause;
  }
  return false;
}

export class CollectiblePurchase {
  state: CollectibleState = { step: 'idle' };
  private generation = 0;
  private listeners = new Set<() => void>();
  private readonly key: string;
  constructor(private deps: CollectibleDeps) {
    this.key = `racing-gang:rgx:${deps.chainId}:${deps.contract.toLowerCase()}:${deps.address.toLowerCase()}:${deps.design}`;
  }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  get busy() { return ['switching', 'checking', 'wallet', 'pending'].includes(this.state.step); }
  private set(state: CollectibleState, gen: number) {
    if (gen !== this.generation) return;
    this.state = state; for (const listener of this.listeners) listener();
  }
  private record(): Record | null {
    try {
      const value = JSON.parse(this.deps.store?.getItem(this.key) ?? 'null');
      return value && Number.isSafeInteger(value.at) && (value.hash === undefined || /^0x[\da-f]{64}$/i.test(value.hash)) ? value : null;
    } catch { return null; }
  }
  private save(record: Record) {
    if (!this.deps.store) throw new CollectibleError('Enable browser storage before buying so a pending purchase can be recovered.');
    try { this.deps.store.setItem(this.key, JSON.stringify(record)); }
    catch { throw new CollectibleError('Your browser could not save purchase progress. Free some storage and try again.'); }
  }
  private clear() { try { this.deps.store?.removeItem(this.key); } catch { /* Ownership remains on-chain. */ } }
  async resume() { if (this.record() && !this.busy) await this.check(); }

  async buy() {
    if (this.busy || this.state.step === 'unknown' || this.state.step === 'done') return;
    if (this.record()) return this.resume();
    const gen = ++this.generation;
    const alive = () => gen === this.generation;
    const matches = () => this.deps.wallet.address()?.toLowerCase() === this.deps.address.toLowerCase();
    if (!matches()) { this.set({ step: 'error', message: 'The wallet does not match this account. Sign in again.', retry: false }, gen); return; }
    this.set({ step: 'checking' }, gen);
    let call: CollectibleCall, gas: bigint, gasPrice: bigint | undefined;
    try {
      const current = await this.deps.chain.read();
      if (!alive()) return;
      if (current.owned) { this.set({ step: 'done' }, gen); return; }
      if (current.minted >= current.supply) throw new CollectibleError('This collectible is sold out.');
      this.set({ step: 'switching' }, gen); await this.deps.wallet.switchChain();
      if (!alive()) return;
      if (!matches()) throw new CollectibleError('The wallet changed. Sign in again before buying.');
      this.set({ step: 'checking' }, gen);
      call = this.deps.build(current.price);
      const prepared = await this.deps.chain.prepare(call);
      if (!alive()) return;
      gas = prepared.gas;
      gasPrice = prepared.gasPrice;
      const balance = await this.deps.wallet.balance();
      if (!alive()) return;
      if (balance < call.value + prepared.gasCost) throw new CollectibleError('Not enough MON for the collectible and network fee.');
      // Marker sebelum wallet: reload atau respons kirim yang hilang tidak boleh mengirim ulang otomatis.
      this.save({ at: Date.now() });
    } catch (error) {
      if (!alive()) return;
      const kind = walletErrorKind(error);
      this.set({ step: 'error', retry: true, message: error instanceof CollectibleError ? error.message :
        kind === 'rejected' ? 'You declined the network change.' : kind === 'insufficient_funds' ? 'Not enough MON for this purchase.' :
        'Could not check the purchase. Refresh and try again.' }, gen);
      return;
    }
    this.set({ step: 'wallet' }, gen);
    let hash: Hex;
    try {
      hash = await this.deps.wallet.send({ ...call, gas, gasPrice });
      if (!/^0x[\da-f]{64}$/i.test(hash)) throw new Error('Wallet returned an invalid transaction hash');
    }
    catch (error) {
      const rejected = walletRejected(error);
      if (rejected) this.clear();
      if (alive()) this.set(rejected ? { step: 'error', message: 'You declined the purchase.', retry: true } :
        { step: 'unknown', message: 'The wallet did not return a transaction hash. Check your wallet history and purchase status before buying again.' }, gen);
      return;
    }
    // Selalu simpan hash ke akun asal, termasuk bila akun berganti saat prompt wallet terbuka.
    try { this.save({ at: Date.now(), hash }); } catch { /* Hash tetap tersedia di state selama halaman terbuka. */ }
    if (!alive()) return;
    this.set({ step: 'pending', hash }, gen);
    await this.confirm(hash, gen);
  }

  private async confirm(hash: Hex, gen: number) {
    try {
      const receipt = await this.deps.chain.receipt(hash);
      if (gen !== this.generation) return;
      if (receipt === 'reverted') {
        this.clear(); this.set({ step: 'error', hash, message: 'The transaction reverted. No collectible was minted.', retry: true }, gen); return;
      }
      const current = await this.deps.chain.read();
      if (gen !== this.generation) return;
      if (current.owned) { this.clear(); this.set({ step: 'done', hash }, gen); }
      else this.set({ step: 'unknown', hash, message: 'Transaction confirmed. Check status again to update ownership.' }, gen);
    } catch {
      this.set({ step: 'unknown', hash, message: 'Confirmation is taking longer. Check status; the purchase will not be sent again.' }, gen);
    }
  }
  async check() {
    if (this.busy) return;
    const record = this.record();
    const hash = record?.hash ?? ('hash' in this.state ? this.state.hash : undefined);
    const gen = ++this.generation;
    this.set({ step: 'checking' }, gen);
    try {
      const current = await this.deps.chain.read();
      if (gen !== this.generation) return;
      if (current.owned) { this.clear(); this.set({ step: 'done', hash }, gen); return; }
      if (hash) { this.set({ step: 'pending', hash }, gen); await this.confirm(hash, gen); }
      else if (record) this.set({ step: 'unknown', message: 'Ownership is not recorded yet. Check your wallet history; an uncertain purchase will not be sent again.' }, gen);
      else this.set({ step: 'idle' }, gen);
    } catch {
      this.set({ step: 'unknown', hash, message: 'Could not reach Monad. Check status again later.' }, gen);
    }
  }
  dispose() { this.generation++; this.listeners.clear(); this.state = { step: 'idle' }; }
}
