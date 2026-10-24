import { useEffect, useState } from 'react';
import { replay } from '@racing-gang/sim';
import f1 from '@racing-gang/sim/fixtures/golden-1.json';
import f2 from '@racing-gang/sim/fixtures/golden-2.json';
import f3 from '@racing-gang/sim/fixtures/golden-3.json';
export function Golden() {
  const [rows,setRows]=useState<{name:string;pass:boolean;hash:string}[]>([]);
  useEffect(()=>{setRows([f1,f2,f3].map(f=>{const r=replay({...f,runId:f.runId as `0x${string}`,seed:f.seed as `0x${string}`});return {name:f.name,pass:r.endTick===f.expected.endTick&&r.endReason===f.expected.endReason&&r.nearMisses===f.expected.nearMisses&&r.finalHash===f.expected.finalHash&&JSON.stringify(r.events)===JSON.stringify(f.expected.events),hash:r.finalHash};}));},[]);
  return <div className="narrow"><span className="eyebrow">DEVELOPMENT ONLY</span><h1>Golden fixtures.</h1><p>Replay sim yang sama di browser, dibandingkan fixture resmi Dharu.</p>{rows.map(row=><section className="info-panel" key={row.name} data-golden-result={row.pass?'PASS':'FAIL'}><h2>{row.name} · {row.pass?'PASS':'FAIL'}</h2><code className="break-code">{row.hash}</code></section>)}</div>;
}
