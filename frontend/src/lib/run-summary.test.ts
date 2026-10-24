import { expect, it } from 'vitest';
import { createSummaryApi, RunSummaryMonitor, summaryStats } from './run-summary';
import type { RunSummaryResponse } from '@racing-gang/config/protocol';
const id=`0x${'11'.repeat(32)}` as const;
const row={index:1,tick:10,vehicleType:1 as const,coins:200,inputHash:`0x${'22'.repeat(32)}` as const,txHash:null,blockNumber:null};
const summary:RunSummaryResponse={runId:id,player:`0x${'33'.repeat(20)}`,seed:`0x${'44'.repeat(32)}`,seedBlock:1,configVersion:1,carTier:0,roomCode:null,lifecycle:'ENDED',result:'PARTIAL',chainStatus:'PENDING',endReason:'CRASH',endTick:50,nearMisses:2,startAt:1000,createdAt:500,nearMissList:[row]};
it('reads the exact public run without token, POST or local claims',async()=>{
  const calls:any[]=[];const api=createSummaryApi('https://game.test/',async(url,init)=>{calls.push({url,init});return Response.json(summary);});expect(await api.read(id)).toEqual(summary);expect(calls[0].url).toBe(`https://game.test/runs/${id}`);expect(calls[0].init.headers.Authorization).toBeUndefined();expect(calls[0].init.method).toBeUndefined();
});
it('rejects invalid IDs before fetch and mismatched identities in a response',async()=>{
  let calls=0;const api=createSummaryApi('https://game.test',async()=>{calls++;return Response.json({...summary,runId:`0x${'55'.repeat(32)}`});});await expect(api.read('../me')).rejects.toMatchObject({code:'BAD_REQUEST'});expect(calls).toBe(0);await expect(api.read(id)).rejects.toMatchObject({code:'INVALID_RESPONSE'});
});
it('rejects inconsistent receipts, duplicate indices, non-finite numbers and impossible coin data',async()=>{
  for(const body of [{...summary,nearMissList:[{...row,txHash:`0x${'55'.repeat(32)}`}]},{...summary,nearMissList:[row,row]},{...summary,nearMisses:1.5},{...summary,nearMissList:[{...row,coins:999}]},{...summary,nearMissList:[{...row,index:3}]}])await expect(createSummaryApi('https://game.test',async()=>Response.json(body)).read(id)).rejects.toMatchObject({code:'INVALID_RESPONSE'});
});
it('accepts future config versions for read-only status, without enabling replay',async()=>{
  expect((await createSummaryApi('https://game.test',async()=>Response.json({...summary,configVersion:2})).read(id)).configVersion).toBe(2);
});
it('keeps pending, recorded and listed coins separate from account balance',()=>{
  expect(summaryStats(summary)).toEqual({recorded:0,pending:2,listedCoins:200});expect(summaryStats({...summary,nearMissList:[{...row,txHash:`0x${'55'.repeat(32)}`,blockNumber:12}]})).toEqual({recorded:1,pending:1,listedCoins:200});
});
it('handles public errors and malformed JSON without presenting cached success as fresh',async()=>{
  await expect(createSummaryApi('https://game.test',async()=>new Response('{}',{status:404})).read(id)).rejects.toMatchObject({code:'NOT_FOUND'});await expect(createSummaryApi('https://game.test',async()=>new Response('<html>')).read(id)).rejects.toMatchObject({code:'INVALID_RESPONSE'});
});
it('single-flights reads and discards aborted late responses on route disposal',async()=>{
  let done!:(value:RunSummaryResponse)=>void;let reads=0;let signal:AbortSignal|undefined;const monitor=new RunSummaryMonitor(id,{read:async(_,s)=>{reads++;signal=s;return new Promise(resolve=>{done=resolve;});}});const pending=monitor.poll();await monitor.poll();expect(reads).toBe(1);monitor.dispose();expect(signal?.aborted).toBe(true);done(summary);await pending;expect(monitor.summary).toBeNull();expect(monitor.status).toBe('closed');
});
it('retains last known data with an error and later recovers chain status',async()=>{
  let fail=false;let body=summary;const monitor=new RunSummaryMonitor(id,{read:async()=>{if(fail)throw Error('offline');return body;}});await monitor.poll();fail=true;await monitor.poll();expect(monitor.summary).toEqual(summary);expect(monitor.status).toBe('error');fail=false;body={...summary,chainStatus:'RECORDED',nearMissList:[{...row,txHash:`0x${'55'.repeat(32)}`,blockNumber:12}]};await monitor.poll();expect(monitor.status).toBe('ready');expect(monitor.summary?.chainStatus).toBe('RECORDED');monitor.dispose();
});
it('rejects a backend regression from ended to running and stable metadata changes',async()=>{
  let body=summary;const monitor=new RunSummaryMonitor(id,{read:async()=>body});await monitor.poll();body={...summary,lifecycle:'RUNNING',result:null,endReason:null,endTick:null};await monitor.poll();expect(monitor.status).toBe('error');expect(monitor.summary?.lifecycle).toBe('ENDED');body={...summary,player:`0x${'66'.repeat(20)}`};await monitor.poll();expect(monitor.status).toBe('error');expect(monitor.summary?.player).toBe(summary.player);monitor.dispose();
});
