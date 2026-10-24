import { useEffect, useState } from 'react';
import { settings } from '../lib/config';

export function BackendStatus() {
  const [mode, setMode] = useState<'loading' | 'mock' | 'live' | 'unknown'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${settings.apiUrl}/health`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) })
      .then(async response => {
        const body = await response.json();
        if (!controller.signal.aborted) setMode(response.ok && body?.ok === true && ['mock', 'live'].includes(body.chainMode) ? body.chainMode : 'unknown');
      })
      .catch(() => { if (!controller.signal.aborted) setMode('unknown'); });
    return () => controller.abort();
  }, []);
  if (mode === 'loading') return null;
  return <p className="fixture-notice" role="status" data-chain-mode={mode}>
    {mode === 'mock' ? 'Simulated blockchain mode. Hashes and receipts are test data only; not yet real testnet transactions.' : mode === 'live' ? 'Testnet recording is enabled. Each transaction\u2019s status still follows the receipt and server verification.' : 'Blockchain status unknown. Testnet recording and transactions can\u2019t be confirmed yet.'}
  </p>;
}
