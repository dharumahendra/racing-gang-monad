// Browser wiring for the purchase flow: deployment/backend checks, Monad RPC reads, Privy wallet, React hook.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { CARS, getDeployment, type Deployment } from '@racing-gang/config';
import type { Address, Hex } from '@racing-gang/config/protocol';
import { BaseError, createPublicClient, createWalletClient, custom, http, type Abi } from 'viem';
import { settings, explorerUrl } from './config';
import { session, useAuthRuntime, type EmbeddedWallet } from './auth-runtime';
import { createVoucherApi } from './voucher-api';
import { buildBuyCall, carNftAbiProblems, PurchaseFlow, revertName, supplyStatus, type PurchaseState } from './purchase';

export type ChainInfo = { chainMode: 'mock' | 'live' | 'unknown'; carNFT: Address | null; chainId: number | null };
let chainInfo: Promise<ChainInfo> | null = null;
/** Backend /health + /config once per page: chain mode and the CarNFT address the backend signs vouchers for. */
export function loadChainInfo(fetcher: typeof fetch = fetch): Promise<ChainInfo> {
  if (!settings.apiUrl) return Promise.resolve({ chainMode: 'unknown', carNFT: null, chainId: null });
  chainInfo ??= Promise.all([
    fetcher(`${settings.apiUrl}/health`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => null),
    fetcher(`${settings.apiUrl}/config`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => null),
  ]).then(([health, config]) => ({
    chainMode: health?.ok === true && (health.chainMode === 'mock' || health.chainMode === 'live') ? health.chainMode : 'unknown',
    carNFT: typeof config?.contracts?.carNFT === 'string' ? config.contracts.carNFT : null,
    chainId: Number.isSafeInteger(config?.chainId) ? config.chainId : null,
  }));
  chainInfo.then(i => { if (i.chainMode === 'unknown') chainInfo = null; });
  return chainInfo;
}

/** Everything that must hold before the purchase button is enabled. Specific, user-readable reasons. */
export function purchaseBlockers(p: { deployment: Deployment | null; info: ChainInfo | null; signedIn: boolean; wallet: boolean; chainId: number }): string[] {
  const out: string[] = [];
  if (settings.mode !== 'live' || !settings.apiUrl) out.push('The game backend isn\u2019t connected.');
  if (!p.deployment) out.push('The car contract isn\u2019t deployed yet (no address/ABI in the deployment manifest).');
  else {
    const problems = carNftAbiProblems(p.deployment.abi.CarNFT);
    if (problems.length) out.push(`The deployed CarNFT ABI is missing: ${problems.join('; ')}.`);
    if (p.deployment.chainId !== p.chainId) out.push('The deployment manifest is for a different chain.');
  }
  if (p.info) {
    if (p.info.chainMode !== 'live') out.push(p.info.chainMode === 'mock' ? 'The backend is in simulated chain mode, so its vouchers can\u2019t be redeemed on-chain.' : 'Backend chain status is unknown.');
    if (p.deployment && p.info.carNFT && p.info.carNFT.toLowerCase() !== p.deployment.carNFT.toLowerCase()) out.push('The backend and this app point to different CarNFT contracts.');
    if (p.info.chainId !== null && p.info.chainId !== p.chainId) out.push('The backend runs on a different chain.');
  }
  if (!p.signedIn) out.push('Sign in with Google to buy.');
  else if (!p.wallet) out.push('Your racing wallet isn\u2019t ready yet.');
  return out;
}

const publicClient = () => createPublicClient({ chain: settings.chain, transport: http(settings.rpcUrl) });

/** minted(tier) from the deployed CarNFT; null when unavailable. */
export function useSupply(tier: number) {
  const deployment = useMemo(() => getDeployment(), []);
  const [minted, setMinted] = useState<bigint | null>(null);
  useEffect(() => {
    setMinted(null);
    if (!deployment || tier < 1 || !CARS[tier] || carNftAbiProblems(deployment.abi.CarNFT).length) return;
    let alive = true;
    void publicClient().readContract({ address: deployment.carNFT, abi: deployment.abi.CarNFT as Abi, functionName: 'minted', args: [tier] })
      .then(v => { if (alive && typeof v === 'bigint') setMinted(v); }).catch(() => {});
    return () => { alive = false; };
  }, [deployment, tier]);
  return supplyStatus(tier, minted);
}

function storage() { try { return window.localStorage; } catch { return null; } }
function revertFrom(error: unknown, abi: Abi): string | null | undefined {
  // Returns the custom error name for a revert, 'Reverted' for an unnamed revert, undefined when it wasn't a revert.
  if (!(error instanceof BaseError)) return undefined;
  const withData = error.walk(e => typeof (e as { data?: unknown })?.data === 'string') as { data?: string } | null;
  if (withData?.data) return revertName(abi, withData.data) ?? 'Reverted';
  return /revert/i.test(error.message) ? 'Reverted' : undefined;
}

export function createPurchaseFlow(o: { deployment: Deployment; address: Address; tier: number; wallet: EmbeddedWallet; getToken: () => Promise<string | null> }) {
  const abi = o.deployment.abi.CarNFT as Abi;
  const client = publicClient();
  const vouchers = createVoucherApi(settings.apiUrl);
  const walletClient = async () => createWalletClient({ account: o.address, chain: settings.chain, transport: custom(await o.wallet.getEthereumProvider()) });
  return new PurchaseFlow({
    address: o.address, tier: o.tier, store: storage(),
    reserve: signal => vouchers.create(o.tier, o.address, o.getToken, signal),
    buildCall: v => buildBuyCall(abi, o.deployment.carNFT, v),
    wallet: {
      address: () => o.wallet.address as Address,
      switchChain: () => o.wallet.switchChain(settings.chain.id),
      balance: () => client.getBalance({ address: o.address }),
      send: async call => (await walletClient()).sendTransaction({ to: call.to, data: call.data, value: call.value }),
    },
    chain: {
      simulate: async (call, from) => {
        try { await client.call({ account: from, to: call.to, data: call.data, value: call.value }); return null; }
        catch (e) { const name = revertFrom(e, abi); if (name === undefined) throw e; return name; }
      },
      receipt: async (hash: Hex) => (await client.waitForTransactionReceipt({ hash, timeout: 120_000 })).status,
      owns: async () => Boolean(await client.readContract({ address: o.deployment.carNFT, abi, functionName: 'ownsTier', args: [o.address, o.tier] })),
    },
    refreshOwned: async () => { await session.refresh(); return session.getState().account?.ownedTiers ?? null; },
  });
}

const idle: PurchaseState = { step: 'idle' };
/** Purchase state for one (account, tier). A new account or tier gets a fresh flow; the old one is disposed. */
export function usePurchase(tier: number) {
  const auth = useAuthRuntime();
  const account = useStore(session, s => s.account);
  const deployment = useMemo(() => getDeployment(), []);
  const [info, setInfo] = useState<ChainInfo | null>(null);
  useEffect(() => { let alive = true; void loadChainInfo().then(i => { if (alive) setInfo(i); }); return () => { alive = false; }; }, []);
  const address = account?.address ?? null;
  const blockers = purchaseBlockers({ deployment, info, signedIn: !!address, wallet: !!auth.wallet && auth.wallet.address.toLowerCase() === address?.toLowerCase(), chainId: settings.chain.id });
  const ready = blockers.length === 0 && info !== null && !!deployment && !!auth.wallet && !!address;
  const flow = useMemo(
    () => (ready ? createPurchaseFlow({ deployment: deployment!, address: address as Address, tier, wallet: auth.wallet!, getToken: auth.getToken }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, deployment, address, tier, auth.wallet?.address],
  );
  useEffect(() => { flow?.resume(); return () => flow?.dispose(); }, [flow]);
  const state = useSyncExternalStore(cb => flow?.subscribe(cb) ?? (() => {}), () => flow?.state ?? idle);
  return { state, blockers: info === null && settings.mode === 'live' ? ['Checking the chain status…'] : blockers, buy: () => void flow?.buy(), check: () => void flow?.check(), ready: !!flow };
}

export function explorerTx(hash: Hex | undefined) {
  const base = explorerUrl;
  if (!hash || !base || !/^https:\/\//.test(base)) return null;
  return `${base.replace(/\/$/, '')}/tx/${hash}`;
}
