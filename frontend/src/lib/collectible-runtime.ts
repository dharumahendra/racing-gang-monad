import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { COLLECTIBLES, getCollectiblesDeployment, monToWei } from '@racing-gang/config';
import { BaseError, createPublicClient, createWalletClient, custom, http, isAddress, type Abi, type Address } from 'viem';
import { useAuthRuntime, type EmbeddedWallet } from './auth-runtime';
import { settings } from './config';
import { revertName } from './purchase';
import { CollectibleError, CollectiblePurchase, buildCollectibleCall, collectiblesAbiProblems, type CollectibleState, type DesignState } from './collectible-purchase';

export const rgxDeployment = getCollectiblesDeployment();
export const rgxProblem = !rgxDeployment ? 'The collection is not available yet.' :
  rgxDeployment.chainId !== settings.chain.id ? 'The collection is configured for another network.' :
    collectiblesAbiProblems(rgxDeployment.abi).length ? 'The collection contract configuration is incomplete.' : null;
const client = createPublicClient({ chain: settings.chain, transport: http(settings.rpcUrl, { timeout: 15_000, retryCount: 0 }) });
let checkedChain: Promise<void> | null = null;
async function checkChain() {
  checkedChain ??= client.getChainId().then(id => { if (id !== rgxDeployment?.chainId) throw new CollectibleError('The RPC is connected to another network.'); });
  try { await checkedChain; } catch (error) { checkedChain = null; throw error; }
}
function deployment() {
  if (rgxProblem || !rgxDeployment) throw new CollectibleError(rgxProblem ?? 'Collection unavailable.');
  return rgxDeployment;
}

/** Stok dan kepemilikan dari kontrak koleksi; tidak memakai cache tier /me. */
export async function readCollectibleDesign(id: number, address: Address | null): Promise<DesignState> {
  const d = deployment();
  const design = COLLECTIBLES.find(item => item.id === id);
  if (!design) throw new CollectibleError('Unknown collectible.');
  await checkChain();
  const contract = { address: d.collectibles, abi: d.abi as Abi };
  const [price, supply, minted, ownership] = await client.multicall({ allowFailure: false, contracts: [
    { ...contract, functionName: 'price', args: [id] },
    { ...contract, functionName: 'supply', args: [id] },
    { ...contract, functionName: 'minted', args: [id] },
    ...(address ? [{ ...contract, functionName: 'ownsDesign', args: [address, id] }] : []),
  ] });
  const owned = address ? ownership : false;
  if (typeof price !== 'bigint' || typeof supply !== 'bigint' || typeof minted !== 'bigint' || typeof owned !== 'boolean' ||
      price !== monToWei(design.priceMon) || supply !== BigInt(design.supply) || minted < 0n || minted > supply) {
    throw new CollectibleError('The collection data does not match its configuration. Refresh before buying.');
  }
  return { price, supply, minted, owned };
}

function simulationError(error: unknown, abi: Abi) {
  let name: string | null = null;
  if (error instanceof BaseError) {
    const raw = error.walk(e => typeof (e as { data?: unknown })?.data === 'string') as { data?: string } | null;
    name = revertName(abi, raw?.data);
  }
  const messages: Record<string, string> = { SoldOut: 'This collectible is sold out.', AlreadyOwned: 'This wallet already owns the collectible.', WrongPrice: 'The price does not match the contract. Refresh and try again.', BadDesign: 'This collectible is not available.' };
  return new CollectibleError(name ? messages[name] ?? 'The contract rejected this purchase.' : 'Could not check the purchase on Monad. Try again later.');
}
function createFlow(id: number, address: Address, wallet: EmbeddedWallet) {
  const d = deployment();
  let store: Storage | null = null;
  try { store = window.localStorage; } catch { /* Flow blocks submission when recovery cannot be saved. */ }
  return new CollectiblePurchase({
    chainId: d.chainId, contract: d.collectibles, address, design: id, store,
    build: price => buildCollectibleCall(d, id, price),
    wallet: {
      address: () => wallet.address as Address,
      switchChain: () => wallet.switchChain(d.chainId),
      balance: () => client.getBalance({ address }),
      send: async call => {
        const wc = createWalletClient({ account: address, chain: settings.chain, transport: custom(await wallet.getEthereumProvider()) });
        const accounts = await wc.getAddresses();
        if (!accounts.some(a => a.toLowerCase() === address.toLowerCase())) throw new CollectibleError('The wallet account changed.');
        return wc.sendTransaction({ to: call.to, data: call.data, value: call.value, gas: call.gas, gasPrice: call.gasPrice });
      },
    },
    chain: {
      read: () => readCollectibleDesign(id, address),
      prepare: async call => {
        await checkChain();
        try {
          const estimate = await client.estimateGas({ account: address, ...call });
          // Monad menagih gas limit: margin 10%, bukan limit besar dari wallet.
          const gas = (estimate * 11n + 9n) / 10n;
          const gasPrice = ((await client.getGasPrice()) * 11n + 9n) / 10n;
          return { gas, gasPrice, gasCost: gas * gasPrice };
        } catch (error) { throw simulationError(error, d.abi as Abi); }
      },
      receipt: async hash => (await client.waitForTransactionReceipt({ hash, timeout: 120_000 })).status,
    },
  });
}
const idle: CollectibleState = { step: 'idle' };
export function useCollectiblePurchase(id: number) {
  const auth = useAuthRuntime();
  const address = auth.address && isAddress(auth.address) ? auth.address : null;
  const flow = useMemo(() => !rgxProblem && auth.authenticated && address && auth.wallet &&
    auth.wallet.address.toLowerCase() === address.toLowerCase() ? createFlow(id, address, auth.wallet) : null,
  // Wallet objects from the bridge may be recreated; identity is the authenticated subject + address.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [id, address, auth.subject, auth.authenticated, auth.wallet?.address]);
  useEffect(() => { void flow?.resume(); return () => flow?.dispose(); }, [flow]);
  const state = useSyncExternalStore(cb => flow?.subscribe(cb) ?? (() => {}), () => flow?.state ?? idle);
  return { state, busy: flow?.busy ?? false, ready: !!flow, buy: () => flow?.buy() ?? Promise.resolve(), check: () => flow?.check() ?? Promise.resolve() };
}
