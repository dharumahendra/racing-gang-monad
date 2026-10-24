import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { loadPublicAudit } from '../lib/public-audit';
import { settings } from '../lib/config';
export function Audit() {
  const { id = '' } = useParams(); const [retry, setRetry] = useState(0);
  const [data, setData] = useState<Awaited<ReturnType<typeof loadPublicAudit>> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError('');
    void loadPublicAudit(id, settings.apiUrl, settings.rpcUrl || settings.chain.rpcUrls.default.http[0], controller.signal)
      .then(next => { if (!controller.signal.aborted) setData(next); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Audit failed.'); });
    return () => controller.abort();
  }, [id, retry]);
  return <div className="narrow"><h1>Public run audit</h1>
    <p>Replay the public input log and compare near misses and the final hash with the deployed RunRegistry. No login required.</p>
    <code className="break-code">{id}</code>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Replaying and reading chain events… This may take a minute.</p> : <>
      <h2 role="status">{data.verdict === 'match' ? 'Replay matches on-chain records' : data.verdict === 'mismatch' ? 'Records do not match' : 'On-chain evidence incomplete'}</h2>
      <p>Backend comparison: {data.backendResult.ok ? 'matches replay' : 'does not match replay'}. This is separate from the on-chain result.</p>
      <dl className="result-metrics"><div><dt>Replayed near misses</dt><dd>{data.chainResult.rows.filter(r => r.replayed).length}</dd></div><div><dt>Recorded near misses</dt><dd>{data.recorded}</dd></div><div><dt>Final tick</dt><dd>{data.chainResult.replayEndTick}</dd></div></dl>
      <p>Replay final hash</p><code className="break-code">{data.chainResult.replayFinalHash}</code>
      <p>Missing start/end events or an unfinished contract run cannot establish a successful audit. Incomplete recordings can also produce count differences.</p>
      {[...data.backendResult.problems, ...data.chainResult.problems].map((p,i)=><p key={i} role="status">{p}</p>)}
      <details><summary>Near-miss comparison ({data.chainResult.rows.length})</summary><ol>{data.chainResult.rows.map(r=><li key={r.index}>#{r.index}: {r.ok ? 'Match' : r.problem}</li>)}</ol></details>
      <p><a href={data.explorer + '/address/' + data.registry} target="_blank" rel="noreferrer">View RunRegistry ↗</a></p>
    </>}
    <div className="host-actions"><button className="button secondary" onClick={()=>setRetry(n=>n+1)}>Run audit again</button><Link className="quiet-link" to={'/run/' + id}>Back to result →</Link></div>
  </div>;
}
