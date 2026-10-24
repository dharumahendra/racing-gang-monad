import { expect, it } from 'vitest';
import { LocalRunner } from './runner';
import { RUN_TICKS, TICK_RATE, PLAYER_L, laneCenter } from '@racing-gang/config';
import { tierTarget, warningViews, laneWarnings, nearMissPops, feedRows, transactionUrl, finalCountdown, rearThreats } from './hud';
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
  const runner=new LocalRunner({...params,seed:'0xed65654466b0823d4c29f4681ea53aa45a23912bfcdf0f0aff81a79a613d396e'});runner.start();runner.advance(3000);runner.input(7);runner.input(2);runner.advance(400);runner.input(6);runner.advance(4000);
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

// --- Regresi: peringatan kendaraan dari belakang (dihitung dari posisi SimView) ---
function vehicle(id:number,lane:number,z:number,l=450){return {id,lane,type:0 as const,x:laneCenter(lane),z,w:180,l};}
const rearBase={...view,tick:300,player:{...view.player,x:laneCenter(1),z:10000}};
it('flags vehicles closing from the rear left, directly behind, and rear right by side',()=>{
 const current={...rearBase,vehicles:[vehicle(1,0,9500),vehicle(2,1,9500),vehicle(3,2,9500)]};
 expect(rearThreats(current).map(t=>t.side)).toEqual(['left','same','right']);
 expect(rearThreats(current).map(t=>t.lane)).toEqual([0,1,2]);
});
it('ignores vehicles ahead and vehicles two or more lanes away',()=>{
 const current={...rearBase,vehicles:[vehicle(1,1,10500),vehicle(2,3,9500)]}; // satu di depan, satu 2 lajur
 expect(rearThreats(current)).toEqual([]);
});
it('drops the warning once the player has pulled far enough ahead',()=>{
 const near={...rearBase,vehicles:[vehicle(1,1,9500)]};  // gap kecil
 expect(rearThreats(near).map(t=>t.side)).toEqual(['same']);
 const far={...rearBase,vehicles:[vehicle(1,1,8000)]};   // hidung > REAR_WINDOW di belakang ekor
 expect(rearThreats(far)).toEqual([]);
});
it('keeps only the nearest vehicle per side and never changes gameplay inputs',()=>{
 const current={...rearBase,vehicles:[vehicle(1,2,9000),vehicle(2,2,9600)]}; // dua di kanan
 const right=rearThreats(current);
 expect(right).toHaveLength(1);
 expect(right[0]).toMatchObject({side:'right',lane:2}); // yang paling dekat (z lebih besar = gap lebih kecil)
 const playerRear=current.player.z-PLAYER_L/2;
 expect(right[0].gap).toBe(playerRear-(9600+450/2));
});
