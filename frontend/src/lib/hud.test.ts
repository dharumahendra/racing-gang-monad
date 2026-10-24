import { expect, it } from 'vitest';
import { LocalRunner } from './runner';
import { RUN_TICKS, TICK_RATE } from '@racing-gang/config';
import { tierTarget, warningViews, laneWarnings, nearMissPops, feedRows, transactionUrl, finalCountdown } from './hud';
const params={runId:`0x${'11'.repeat(32)}` as const,seed:`0x${'22'.repeat(32)}` as const,carTier:0};
const view=new LocalRunner(params).current;
it('does not offer Tier 2 qualification to Starter even with 150 local near misses',()=>{
  expect(tierTarget(0,150)).toMatchObject({tier:1,required:40,achieved:true,percent:100});
  expect(tierTarget(1,40)).toMatchObject({tier:2,required:75,achieved:false});expect(tierTarget(4,200)).toBeNull();
});
it('shows all pending disruptions with exact 60-tick countdown and human lane labels',()=>{
  const current={...view,tick:300,disruptions:[{id:'a',kind:'RED' as const,source:'NPC' as const,lanes:[0,1],warnTick:300,activeTick:360},{id:'b',kind:'NITRO' as const,source:'SPECTATOR' as const,lanes:[],warnTick:300,activeTick:360}]};
  expect(warningViews(current).map(d=>[d.id,d.seconds,d.laneLabel])).toEqual([['a',2,'Lane 1, 2'],['b',2,'All lanes']]);
  expect(warningViews({...current,tick:330})[0].seconds).toBe(1);expect(warningViews({...current,tick:360})).toEqual([]);
  expect(laneWarnings(current).filter(l=>l.kind==='RED').map(l=>l.lane)).toEqual([0,1]);
});
it('keeps actual +100/+200 near-miss events available even when a render frame skips ticks',()=>{
  const runner=new LocalRunner({...params,seed:'0x8cfd1f92705b1e83840e3e257e0120b7fc40a9569070f053c50a1d6ad428d684'});runner.start();runner.advance(3000);runner.input(2);runner.advance(2400);
  expect(runner.events.some(e=>e.type==='NEAR_MISS')).toBe(true);const pops=nearMissPops(runner.events,runner.current.tick);expect(pops.length).toBeGreaterThan(0);expect(pops.every(p=>p.coins===100||p.coins===200)).toBe(true);expect(nearMissPops(runner.events,runner.current.tick+100)).toEqual([]);
});
it('joins receipts and verified events by index even when a receipt arrives first, without crediting a balance',()=>{
  const tx=`0x${'33'.repeat(32)}` as const;
  const rows=feedRows([{t:'nearMiss.verified',index:1,tick:6,vehicleType:0,coins:100}],[{t:'nearMiss.recorded',index:1,txHash:tx,blockNumber:10,latencyMs:120},{t:'nearMiss.recorded',index:1,txHash:tx,blockNumber:10,latencyMs:120},{t:'nearMiss.recorded',index:2,txHash:tx,blockNumber:11,latencyMs:140}]);
  expect(rows).toHaveLength(2);expect(rows.find(r=>r.index===1)).toMatchObject({status:'recorded',coins:100,block:10});expect(rows.find(r=>r.index===2)?.coins).toBeNull();
  expect(transactionUrl('https://testnet.monadexplorer.com',tx)).toBe(`https://testnet.monadexplorer.com/tx/${tx}`);expect(transactionUrl('javascript:alert(1)',tx)).toBeNull();expect(transactionUrl('https://testnet.monadexplorer.com','invalid')).toBeNull();
});
it('shows a 5..1 final countdown only in the last five seconds of a running run',()=>{
  expect(finalCountdown({...view,tick:RUN_TICKS-5*TICK_RATE-1})).toBeNull();
  expect(finalCountdown({...view,tick:RUN_TICKS-5*TICK_RATE})).toBe(5);
  expect(finalCountdown({...view,tick:RUN_TICKS-4*TICK_RATE-1})).toBe(5);
  expect(finalCountdown({...view,tick:RUN_TICKS-1})).toBe(1);
  expect(finalCountdown({...view,tick:RUN_TICKS})).toBeNull();
  expect(finalCountdown({...view,tick:RUN_TICKS-TICK_RATE,ended:true})).toBeNull();
});
