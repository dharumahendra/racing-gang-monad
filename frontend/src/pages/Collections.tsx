import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatEther, isAddress, type Address } from 'viem';
import { designs } from '../nft/designs';
import { useAuthRuntime } from '../lib/auth-runtime';
import { readCollectibleDesign, rgxDeployment, rgxProblem, useCollectiblePurchase } from '../lib/collectible-runtime';
import type { DesignState } from '../lib/collectible-purchase';

type Design = typeof designs[number];
function CollectionCard({ design, data, locked, onBusy, refresh }: { design: Design; data?: DesignState; locked: boolean; onBusy: (id: number | null) => void; refresh: () => void }) {
  const auth = useAuthRuntime();
  const purchase = useCollectiblePurchase(design.id);
  const { state } = purchase;
  const owned = data?.owned || state.step === 'done';
  const soldOut = !!data && data.minted >= data.supply;
  const hash = 'hash' in state ? state.hash : undefined;
  const explorer = rgxDeployment?.explorerUrl;
  useEffect(() => { if (state.step === 'done') refresh(); }, [state.step, refresh]);
  const buy = async () => { onBusy(design.id); try { await purchase.buy(); } finally { onBusy(null); } };
  const labels: Record<string, string> = { switching: 'Switching network…', checking: 'Checking purchase…', wallet: 'Confirm in your wallet…', pending: 'Waiting for confirmation…' };
  return <article className="collection-card" data-design={design.id} aria-labelledby={`design-${design.id}`}>
    <div className="collection-art"><img src={`/collectibles/images/${design.asset.slug}.png`} alt={design.name} loading="lazy" width="640" height="480"/>
      {owned && <span className="collection-owned">Owned</span>}
    </div>
    <div className="collection-card-body">
      <p className="eyebrow">RGX · DESIGN {design.id}</p><h2 id={`design-${design.id}`}>{design.name}</h2>
      <div className="collection-price"><strong>{data ? formatEther(data.price) : design.priceMon} MON</strong><span>{data ? `${data.supply - data.minted} of ${data.supply} left` : 'Stock not loaded'}</span></div>
      <p className="collection-rule">One per wallet. Non-transferable.</p>
      {!auth.authenticated ? <button className="button wide" disabled={!auth.configured || !auth.ready} onClick={auth.login}>Sign in with Google</button> :
        !auth.address ? <button className="button wide" disabled={!auth.walletReady} onClick={auth.createWallet}>Set up wallet</button> :
          <button className="button wide" disabled={owned || soldOut || locked || purchase.busy || !purchase.ready || !data || state.step === 'unknown' || (state.step === 'error' && !state.retry)} onClick={() => void buy()}>
            {owned ? 'In your collection' : purchase.busy ? labels[state.step] : soldOut ? 'Sold out' : `Buy for ${data ? formatEther(data.price) : design.priceMon} MON`}
          </button>}
      {state.step === 'done' && <p className="collection-success" role="status">Purchase complete. This collectible belongs to your wallet.</p>}
      {(state.step === 'error' || state.step === 'unknown') && <p className="inline-error" role="alert">{state.message}</p>}
      {state.step === 'unknown' && <button className="button secondary wide" disabled={locked || purchase.busy} onClick={() => void purchase.check()}>Check status</button>}
      {hash && explorer && <a className="quiet-link" href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}
      <details className="collection-credits"><summary>Artwork credits</summary><p>{design.asset.credits}</p>{design.asset.sourceUrl && <a href={design.asset.sourceUrl} target="_blank" rel="noreferrer">Original model ↗</a>}</details>
    </div>
  </article>;
}

export function Collections() {
  const auth = useAuthRuntime();
  const address = auth.address && isAddress(auth.address) ? auth.address as Address : null;
  const key = address?.toLowerCase() ?? 'public';
  const [revision, setRevision] = useState(0);
  const [busyDesign, setBusyDesign] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<{ key: string; rows: Record<number, DesignState>; loading: boolean; error: string | null }>({ key, rows: {}, loading: true, error: null });
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => { setBusyDesign(null); }, [key]);
  useEffect(() => {
    let active = true;
    setSnapshot({ key, rows: {}, loading: true, error: null });
    void (async () => {
      try {
        const rows: Record<number, DesignState> = {};
        // Tiga batch kecil: tidak membuat polling cepat ke RPC publik.
        for (const design of designs) rows[design.id] = await readCollectibleDesign(design.id, address);
        if (active) setSnapshot({ key, rows, loading: false, error: null });
      } catch {
        if (active) setSnapshot({ key, rows: {}, loading: false, error: rgxProblem ?? 'Could not load collection data from Monad. Try refreshing.' });
      }
    })();
    return () => { active = false; };
  }, [key, revision]);
  // Jangan tampilkan kepemilikan akun lama bahkan sebelum effect akun baru dijalankan.
  const current = snapshot.key === key ? snapshot : { rows: {} as Record<number, DesignState>, loading: true, error: null };
  return <div className="collection-page">
    <header className="collection-heading"><div><p className="eyebrow">RACING GANG COLLECTIBLES · MONAD TESTNET</p><h1>Collectibles.</h1><p>Three collectible rides. No race requirement or game coins needed.</p></div><button className="button secondary" disabled={current.loading || busyDesign !== null} onClick={refresh}>Refresh</button></header>
    <p className="collection-note">Collectibles stay in your wallet and do not change racing performance. Your Starter and race tiers stay in the Garage.</p>
    {!auth.configured && <p role="status">Google login is being set up. You can still browse the collection.</p>}
    {current.error && <p className="inline-error" role="alert">{current.error}</p>}
    {current.loading && <p className="fine-print" role="status">Reading stock and wallet ownership…</p>}
    <section className="collection-grid" aria-label="Collectible vehicles" aria-busy={current.loading}>
      {designs.map(design => <CollectionCard key={`${key}:${design.id}`} design={design} data={current.rows[design.id]} locked={busyDesign !== null} onBusy={setBusyDesign} refresh={refresh}/>)}
    </section>
    <div className="collection-footer"><Link className="quiet-link" to="/">Back to Garage →</Link>{rgxDeployment?.explorerUrl && <a className="quiet-link" href={`${rgxDeployment.explorerUrl}/address/${rgxDeployment.collectibles}`} target="_blank" rel="noreferrer">Collection contract ↗</a>}</div>
  </div>;
}
