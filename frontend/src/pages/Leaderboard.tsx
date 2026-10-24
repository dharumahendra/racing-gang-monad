import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CARS } from '@racing-gang/config';
import type { LeaderboardResponse } from '@racing-gang/config/protocol';
import { createLeaderboardApi, shortAddress } from '../lib/leaderboard-api';
import { settings } from '../lib/config';

const LIMIT = 20;
type Status = 'loading' | 'ready' | 'error';

export function LeaderboardPanel({ apiUrl }: { apiUrl: string }) {
  const [entries, setEntries] = useState<LeaderboardResponse['entries'] | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!apiUrl) { setStatus('error'); setError('The leaderboard service is being set up.'); return; }
    const controller = new AbortController();
    let active = true;
    setStatus('loading');
    setError(null);
    createLeaderboardApi(apiUrl)
      .read(LIMIT, controller.signal)
      .then((data) => { if (active) { setEntries(data.entries); setStatus('ready'); } })
      .catch((err) => {
        if (!active || controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
        setError(err instanceof Error ? err.message : 'Could not load the leaderboard.');
        setStatus('error');
      });
    // Batalkan request yang tertinggal saat unmount atau sebelum memuat ulang.
    return () => { active = false; controller.abort(); };
  }, [apiUrl, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  if (!apiUrl)
    return (
      <section className="info-panel">
        <h2>Leaderboard not available yet</h2>
        <p>The leaderboard service is being set up. No sample ranking is shown as proof.</p>
      </section>
    );

  return (
    <section className="leaderboard" data-leaderboard-status={status} aria-busy={status === 'loading'}>
      <div className="summary-toolbar">
        <p className="eyebrow">PUBLIC LEADERBOARD / NO LOGIN</p>
        <button className="button secondary" onClick={refresh} disabled={status === 'loading'}>Refresh</button>
      </div>
      {status === 'error' && <p className="inline-error" role="alert">{error}</p>}
      {status === 'loading' && !entries && <p role="status">Loading the leaderboard…</p>}
      {status === 'ready' && entries && entries.length === 0 && (
        <p role="status">No verified runs yet. Be the first to record near misses.</p>
      )}
      {entries && entries.length > 0 && (
        <ol className="leaderboard-rows" aria-label="Top near misses">
          {entries.map((row, i) => (
            <li key={row.runId} className="leaderboard-row" data-rank={i + 1}>
              <span className="leaderboard-rank" aria-label={`Rank ${i + 1}`}>#{i + 1}</span>
              <span className="leaderboard-player break-code" title={row.player}>{shortAddress(row.player)}</span>
              <span className="leaderboard-car">{CARS[row.carTier]?.name ?? `Tier ${row.carTier}`}</span>
              <span className="leaderboard-near"><strong>{row.nearMisses.toLocaleString('en-US')}</strong> near misses</span>
              <span className="leaderboard-links">
                <Link className="quiet-link" to={`/run/${row.runId}`}>Result</Link>
                <Link className="quiet-link" to={`/audit/${row.runId}`}>Audit</Link>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="fine-print" role="note">
        Ranked by near misses in a single verified run. A listing here is not proof that every near miss is
        finalized on-chain — open Result or Audit to check each run.
      </p>
    </section>
  );
}

export function Leaderboard() {
  return (
    <div className="narrow leaderboard-page">
      <span className="eyebrow">LEADERBOARD</span>
      <h1>Top near misses.</h1>
      <LeaderboardPanel apiUrl={settings.mode === 'live' ? settings.apiUrl : ''} />
      <Link className="button secondary" to="/">Back to garage</Link>
    </div>
  );
}
