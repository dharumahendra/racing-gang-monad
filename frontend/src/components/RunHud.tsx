import { CARS, LANES, RUN_TICKS, TICK_RATE, toKmh, type DisruptionKind } from '@racing-gang/config';
import type { SimView } from '@racing-gang/sim';
import type { LocalRunner } from '../lib/runner';
import { laneWarnings, nearMissPops, tierTarget, warningViews } from '../lib/hud';
import type { AudioState } from '../lib/warning-audio';
const names={NITRO:'Nitro paksa',SPIKES:'Rantai',RED:'Red zone'};
export function WarningIcon({kind}:{kind:DisruptionKind}){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==='NITRO'?<path d="M13 2 4 14h7l-1 8 10-13h-7l0-7Z"/>:kind==='SPIKES'?<><path d="m9 15 6-6M7 13l-2 2a4 4 0 0 0 6 6l3-3M17 11l2-2a4 4 0 0 0-6-6l-3 3"/></>:<><path d="m8 3-5 5v8l5 5h8l5-5V8l-5-5Z"/><path d="M7 12h10"/></>}</svg>;
}
export function AudioControl({audio}:{audio:{state:AudioState;toggle:()=>void}}){
  const text={locked:'Aktifkan suara',ready:'Suara aktif',muted:'Suara mati',blocked:'Aktifkan suara lagi',unavailable:'Suara tidak tersedia'};
  return <div className="audio-control"><button type="button" className="audio-button" aria-pressed={audio.state==='ready'} data-audio-state={audio.state} disabled={audio.state==='unavailable'} onClick={audio.toggle}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 9h4l5-5v16l-5-5H3Z"/>{audio.state==='ready'?<path d="M16 7c3 3 3 7 0 10m3-13c5 5 5 11 0 16"/>:<path d="m16 9 6 6m0-6-6 6"/>}</svg>{text[audio.state]}</button>{['blocked','unavailable'].includes(audio.state)&&<small role="status">Peringatan visual tetap tersedia.</small>}</div>;
}
export function RunHud({view,tier,online=false}:{view:SimView;tier:number;online?:boolean}){
  const target=tierTarget(tier,view.nearMisses);const lanes=laneWarnings(view);const effect=view.player.nitroActive?'Nitro aktif · rem diabaikan':view.player.slowTicks>0?`Melambat · ${Math.ceil(view.player.slowTicks/TICK_RATE)} dtk`:view.player.braking?'Rem aktif':'Gas otomatis';
  return <><div className="race-hud"><div><small>Sisa waktu</small><strong>{Math.ceil((RUN_TICKS-view.tick)/TICK_RATE)}<span> dtk</span></strong></div><div><small>Kecepatan</small><strong>{toKmh(view.player.speed)}<span> km/j</span></strong></div><div><small>Mepet lokal</small><strong>{view.nearMisses}{target&&<span> /{target.required}</span>}</strong></div><div><small>{online?'Koin dari sim':'Koin latihan'}</small><strong>{view.coins.toLocaleString('id-ID')}</strong></div></div>
    <div className="drive-status"><span data-driving-effect={view.player.nitroActive?'nitro':view.player.slowTicks?'slow':view.player.braking?'brake':'gas'}>{effect}</span>{target?<span className={target.achieved?'target-achieved':''}>{target.achieved?`Target ${CARS[target.tier].name} tercapai lokal`:`Target lokal ${CARS[target.tier].name} · ${view.nearMisses}/${target.required}`}</span>:<span>Mobil tier tertinggi</span>}</div>
    <div className="lane-awareness" aria-label="Peringatan per lajur">{Array.from({length:LANES},(_,lane)=>{const warning=lanes.find(w=>w.lane===lane);const red=view.redLanes.some(r=>r.lane===lane&&r.active);return <span key={lane} className={`lane-signal ${warning?'has-warning':''} ${red?'red-active':''}`} data-lane-warning={warning?.kind||'none'} aria-label={`Lajur ${lane+1}: ${red?'red zone aktif':warning?`${names[warning.kind]} dalam ${warning.seconds} detik`:'tanpa peringatan'}`}><b>{lane+1}</b>{warning?<><WarningIcon kind={warning.kind}/><small>{warning.seconds} dtk</small></>:red?<><WarningIcon kind="RED"/><small>Aktif</small></>:<small>—</small>}</span>;})}</div></>;
}
export function RunWarnings({view,enabled}:{view:SimView;enabled:boolean}){
  const warnings=enabled?warningViews(view):[];
  return <div className="warning-stack">{warnings.map(w=><div className={`warning-card warning-${w.kind.toLowerCase()}`} key={`${w.id}:${w.activeTick}`} data-warning-kind={w.kind} data-warning-seconds={w.seconds} role="status"><WarningIcon kind={w.kind}/><div><strong>{names[w.kind]}</strong><span>{w.laneLabel}</span></div><b>{w.seconds}<small>dtk</small></b></div>)}</div>;
}
export function CoinPops({runner}:{runner:LocalRunner}){
  return <div className="coin-pops" aria-label="Mepet lokal terbaru">{nearMissPops(runner.events,runner.current.tick).map(event=><span key={`${event.index}:${event.tick}`} className="coin-pop" data-local-coins={event.coins}>+{event.coins}<small>mepet lokal #{event.index}</small></span>)}</div>;
}
