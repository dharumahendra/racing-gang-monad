import { CARS, LANE_WIDTH, LANES, PLAYER_L, RUN_TICKS, TICK_RATE, type DisruptionKind } from '@racing-gang/config';
import type { SimEvent, SimView } from '@racing-gang/sim';
import type { PlayS2C, NearMissRecorded } from '@racing-gang/config/protocol';
export type HudWarning={id:string;kind:DisruptionKind;seconds:number;remainingMs:number;laneLabel:string;activeTick:number;lanes:number[]};

/** Seberapa jauh (cm, hidung-ke-ekor) di belakang pemain sebuah kendaraan masih dianggap ancaman mepet. */
const REAR_WINDOW = PLAYER_L * 2;
export type RearSide = 'left' | 'same' | 'right';
export type RearThreat = { side: RearSide; lane: number; gap: number };
/**
 * Kendaraan yang berada dekat di belakang, dihitung dari posisi di SimView (bukan kecepatan mendekat).
 * Pemain selalu lebih cepat dari lalu lintas, jadi "ancaman dari belakang" = kendaraan yang pusatnya
 * masih di belakang pemain tetapi hidungnya dekat dengan ekor pemain, di lajur pemain atau lajur sebelah
 * (bahaya saat pindah lajur). Saat pemain menjauh, gap melewati REAR_WINDOW dan indikator hilang sendiri.
 * Hanya tampilan: tidak mengubah tabrakan, mepet, atau logika lain.
 */
export function rearThreats(view: SimView): RearThreat[] {
  const playerLane = Math.min(LANES - 1, Math.max(0, Math.round((view.player.x - LANE_WIDTH / 2) / LANE_WIDTH)));
  const playerRear = view.player.z - PLAYER_L / 2;
  const nearest = new Map<RearSide, RearThreat>();
  for (const v of view.vehicles) {
    if (v.z > view.player.z) continue;                 // pusat kendaraan di depan pemain: bukan ancaman belakang
    const delta = v.lane - playerLane;
    if (Math.abs(delta) > 1) continue;                 // hanya lajur pemain dan lajur bersebelahan
    const gap = playerRear - (v.z + v.l / 2);           // jarak ekor pemain ke hidung kendaraan (bisa negatif = beririsan)
    if (gap > REAR_WINDOW) continue;                   // sudah tertinggal jauh: ancaman lewat
    const side: RearSide = delta < 0 ? 'left' : delta > 0 ? 'right' : 'same';
    const prev = nearest.get(side);
    if (!prev || gap < prev.gap) nearest.set(side, { side, lane: v.lane, gap });
  }
  return (['left', 'same', 'right'] as const).flatMap(side => { const t = nearest.get(side); return t ? [t] : []; });
}
export function tierTarget(carTier:number,count:number){
  const car=CARS.find(c=>c.tier>carTier&&c.minCarTier<=carTier);if(!car)return null;
  return {tier:car.tier,required:car.reqNearMiss,achieved:count>=car.reqNearMiss,percent:Math.min(100,Math.max(0,count/car.reqNearMiss*100))};
}
export function warningViews(view:SimView):HudWarning[]{
  return view.disruptions.filter(d=>d.warnTick<=view.tick&&d.activeTick>view.tick).sort((a,b)=>a.activeTick-b.activeTick||a.id.localeCompare(b.id)).map(d=>({id:d.id,kind:d.kind,seconds:Math.ceil((d.activeTick-view.tick)/TICK_RATE),remainingMs:(d.activeTick-view.tick)*1000/TICK_RATE,laneLabel:d.kind==='NITRO'?'All lanes':`Lane ${d.lanes.map(l=>l+1).join(', ')}`,activeTick:d.activeTick,lanes:d.lanes}));
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
/** Hitung mundur akhir run: detik tersisa (5..1) saat waktu tinggal ≤ `seconds` detik; null di luar itu atau setelah run selesai. */
export function finalCountdown(view:SimView,seconds=5):number|null{
  if(view.ended)return null;const left=RUN_TICKS-view.tick;
  return left>0&&left<=seconds*TICK_RATE?Math.ceil(left/TICK_RATE):null;
}
