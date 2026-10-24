import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CARS, CONFIG_VERSION, TICK_RATE } from '@racing-gang/config';
import { createSummaryApi, RunSummaryMonitor, summaryStats } from '../lib/run-summary';
import { hex32 } from '../lib/room-api';
import { settings, explorerUrl } from '../lib/config';
import { transactionUrl } from '../lib/hud';
const reasons={CRASH:'Hit a vehicle',RED_ZONE_FAIL:'Caught in red zone',TIME_UP:'Time up',TIMEOUT:'Connection timeout'};
const lifecycle={CREATED:'Run created',READY:'Waiting to start',RUNNING:'In progress',ENDED:'Run finished'};
const results={VERIFIED:'Server verified',PARTIAL:'Partially verified',INVALID:'Invalid'};
const chains={PENDING:'Awaiting recording',RECORDED:'Recorded by server',RECORD_FAILED:'Recording failed'};
export function RunSummaryPanel({id,apiUrl}:{id:string;apiUrl:string}){
  const [monitor,setMonitor]=useState<RunSummaryMonitor|null>(null);const [,render]=useState(0);const [limit,setLimit]=useState(20);const [deadline]=useState(()=>Date.now()+90000);
  useEffect(()=>{if(!apiUrl||!hex32(id))return;const next=new RunSummaryMonitor(id,createSummaryApi(apiUrl));setMonitor(next);setLimit(20);void next.poll();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&Date.now()<deadline&&!(next.summary?.lifecycle==='ENDED'&&next.summary.result!==null&&next.summary.chainStatus==='RECORDED'))void next.poll();render(n=>n+1);},3000);const focus=()=>{if(Date.now()<deadline)void next.poll();};window.addEventListener('focus',focus);return()=>{clearInterval(timer);window.removeEventListener('focus',focus);next.dispose();};},[id,apiUrl,deadline]);
  // Refresh the existing monitor; do not restart an effect or discard cached state.
  function refresh(){void monitor?.poll();}
  if(!hex32(id))return <section className="info-panel"><h2>Invalid run ID</h2><p role="alert">Open the full result link provided after the run was created.</p></section>;
  if(!apiUrl)return <section className="info-panel"><h2>Results not available yet</h2><p>The results service is being set up. No sample result or transaction is shown as proof.</p><code className="break-code">{id}</code></section>;
  const summary=monitor?.summary;const stats=summary?summaryStats(summary):null;
  return <section className="run-summary" data-summary-status={monitor?.status||'loading'} aria-busy={!summary&&monitor?.status!=='error'}>
    <div className="summary-toolbar"><p className="eyebrow">PUBLIC SUMMARY / NO LOGIN</p><button className="button secondary" onClick={refresh} disabled={!monitor}>Refresh status</button></div>
    {monitor?.error&&<p className="inline-error" role="alert">{monitor.error}{summary?' The data below is the last state read successfully.':''}</p>}
    {!summary?<p role="status">{monitor?.status==='error'?'Could not read the result. Try refreshing the status.':'Fetching run status…'}</p>:<>
      <div className="result-status-grid"><div><small>Game</small><strong data-run-lifecycle={summary.lifecycle}>{lifecycle[summary.lifecycle]}</strong><p>{summary.endReason?reasons[summary.endReason]:summary.lifecycle==='ENDED'?'Awaiting final details.':'No final result yet.'}</p></div><div><small>Gameplay verification</small><strong data-run-verification={summary.result||'PENDING'}>{summary.result?results[summary.result]:'Awaiting check'}</strong><p>{summary.result==='PARTIAL'?'Some data could not be confirmed.':summary.result==='INVALID'?'This result does not prove a pass.':'Status from the game service.'}</p></div><div><small>Chain recording</small><strong data-run-chain={summary.chainStatus}>{chains[summary.chainStatus]}</strong><p>Receipt and account balance are checked separately.</p></div></div>
      <dl className="result-metrics"><div><dt>Near misses per server</dt><dd>{summary.nearMisses}</dd></div><div><dt>Has tx hash</dt><dd>{stats!.recorded}<small> / {summary.nearMisses}</small></dd></div><div><dt>No tx hash yet</dt><dd>{stats!.pending}</dd></div></dl>
      <p className="result-balance-note">{stats!.listedCoins.toLocaleString('en-US')} coins from {summary.nearMissList.length} available entries. This is not an account balance. A pass is not inferred from the near miss count on this page.</p>
      {summary.configVersion!==CONFIG_VERSION&&<p className="fixture-notice">Run version {summary.configVersion} differs from the app {CONFIG_VERSION}. The summary is read-only; no replay is run.</p>}
      <details className="run-details"><summary>Run details</summary><dl><dt>ID</dt><dd className="break-code">{summary.runId}</dd><dt>Player</dt><dd className="break-code">{summary.player}</dd><dt>Car</dt><dd>{CARS[summary.carTier]?.name??`Tier ${summary.carTier}`}</dd><dt>Duration to final tick</dt><dd>{summary.endTick===null?'Not finished':`${(summary.endTick/TICK_RATE).toFixed(1)} s`}</dd><dt>Room</dt><dd>{summary.roomCode||'No room'}</dd><dt>Seed block / version</dt><dd>{summary.seedBlock} / {summary.configVersion}</dd></dl></details>
      <div className="result-list-heading"><h2>Near miss proof.</h2><span>{summary.nearMissList.length} entries available</span></div>
      {summary.nearMissList.length===0?<p>No near miss entries in the server response yet. Recording may follow.</p>:<ol className="result-rows">{[...summary.nearMissList].sort((a,b)=>a.index-b.index).slice(0,limit).map(row=>{const href=row.txHash?transactionUrl(explorerUrl,row.txHash):null;return <li key={row.index} data-summary-receipt={row.index}><div><strong>#{row.index} · {row.vehicleType===1?'Truck':'Car'}</strong><span>Tick {row.tick} · {row.coins} coins on entry</span></div><div><strong>{row.txHash?'Has tx hash':'Awaiting tx hash'}</strong><span>{row.blockNumber!==null?`Block ${row.blockNumber.toLocaleString('en-US')}`:'No block yet'}</span>{href&&<a href={href} target="_blank" rel="noopener noreferrer">View transaction ↗</a>}</div></li>;})}</ol>}
      {summary.nearMissList.length>limit&&<button className="button secondary" onClick={()=>setLimit(n=>n+20)}>Show next 20</button>}
      <p className="fine-print" role="status">{monitor?.lastUpdated?`Last read ${new Date(monitor.lastUpdated).toLocaleTimeString('en-US')}. `:''}{Date.now()>=deadline?'Auto-refresh paused after 90 seconds. Use Refresh status.':summary.lifecycle==='ENDED'&&summary.chainStatus==='RECORDED'&&summary.result?'Final summary received.':'Updated periodically while the page is visible.'}</p>
    </>}
  </section>;
}
export function Result(){const {id=''}=useParams();return <div className="result-page"><span className="eyebrow">RESULT / RUN</span><h1>Trip proof.</h1><RunSummaryPanel key={id} id={id} apiUrl={settings.mode==='live'?settings.apiUrl:''}/><Link className="button" to="/">Back to garage</Link></div>;}
export function ResultLab(){const [search]=useSearchParams();const id=search.get('id')||`0x${'11'.repeat(32)}`;return <div className="result-page"><p className="fixture-notice">DEVELOPMENT ONLY · Summary from a simulated server. Not a live result, balance, or chain proof.</p><h1>Trip proof.</h1><RunSummaryPanel key={id} id={id} apiUrl="/__result_fixture"/></div>;}
