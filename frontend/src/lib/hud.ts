import { CARS, LANES, TICK_RATE, type DisruptionKind } from '@racing-gang/config';
import type { SimEvent, SimView } from '@racing-gang/sim';
import type { PlayS2C, NearMissRecorded } from '@racing-gang/config/protocol';
export type HudWarning={id:string;kind:DisruptionKind;seconds:number;remainingMs:number;laneLabel:string;activeTick:number;lanes:number[]};
export function tierTarget(carTier:number,count:number){
  const car=CARS.find(c=>c.tier>carTier&&c.minCarTier<=carTier);if(!car)return null;
  return {tier:car.tier,required:car.reqNearMiss,achieved:count>=car.reqNearMiss,percent:Math.min(100,Math.max(0,count/car.reqNearMiss*100))};
}
export function warningViews(view:SimView):HudWarning[]{
  return view.disruptions.filter(d=>d.warnTick<=view.tick&&d.activeTick>view.tick).sort((a,b)=>a.activeTick-b.activeTick||a.id.localeCompare(b.id)).map(d=>({id:d.id,kind:d.kind,seconds:Math.ceil((d.activeTick-view.tick)/TICK_RATE),remainingMs:(d.activeTick-view.tick)*1000/TICK_RATE,laneLabel:d.kind==='NITRO'?'Semua lajur':`Lajur ${d.lanes.map(l=>l+1).join(', ')}`,activeTick:d.activeTick,lanes:d.lanes}));
}
export function laneWarnings(view:SimView){
  const result=new Map<number,{lane:number;kind:DisruptionKind;seconds:number}>();const priority={NITRO:0,SPIKES:1,RED:2};
  for(const w of warningViews(view))for(const lane of w.kind==='NITRO'?Array.from({length:LANES},(_,i)=>i):w.lanes){const old=result.get(lane);if(!old||priority[w.kind]>priority[old.kind])result.set(lane,{lane,kind:w.kind,seconds:w.seconds});}
  return [...result.values()].sort((a,b)=>a.lane-b.lane);
}
export function nearMissPops(events:readonly SimEvent[],tick:number){return events.filter((e):e is Extract<SimEvent,{type:'NEAR_MISS'}>=>e.type==='NEAR_MISS'&&tick>=e.tick&&tick-e.tick<TICK_RATE*1.5).slice(-4);}
type Verified=Extract<PlayS2C,{t:'nearMiss.verified'}>;
export function feedRows(verified:Iterable<Verified>,recorded:Iterable<NearMissRecorded>){
  const a=new Map([...verified].map(e=>[e.index,e]));const b=new Map([...recorded].map(e=>[e.index,e]));
  return [...new Set([...a.keys(),...b.keys()])].sort((x,y)=>y-x).map(index=>({index,status:b.has(index)?'recorded' as const:'verified' as const,coins:a.get(index)?.coins??null,txHash:b.get(index)?.txHash??null,block:b.get(index)?.blockNumber??null,latency:b.get(index)?.latencyMs??null}));
}
export function transactionUrl(explorer:string|undefined,hash:string){
  if(!explorer||!/^0x[\da-f]{64}$/i.test(hash))return null;
  try{const url=new URL(explorer);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)return null;url.pathname=url.pathname.replace(/\/$/,'')+`/tx/${hash}`;return url.href;}catch{return null;}
}
