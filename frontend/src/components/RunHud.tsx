import { RUN_TICKS, TICK_RATE, toKmh, type DisruptionKind } from '@racing-gang/config';
import type { SimView } from '@racing-gang/sim';
import type { LocalRunner } from '../lib/runner';
import { finalCountdown, nearMissPops, tierTarget, warningViews } from '../lib/hud';
import type { AudioState } from '../lib/warning-audio';
const names={NITRO:'Forced nitro',SPIKES:'Spikes',RED:'Red zone'};
export function WarningIcon({kind}:{kind:DisruptionKind}){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==='NITRO'?<path d="M13 2 4 14h7l-1 8 10-13h-7l0-7Z"/>:kind==='SPIKES'?<><path d="m9 15 6-6M7 13l-2 2a4 4 0 0 0 6 6l3-3M17 11l2-2a4 4 0 0 0-6-6l-3 3"/></>:<><path d="m8 3-5 5v8l5 5h8l5-5V8l-5-5Z"/><path d="M7 12h10"/></>}</svg>;
}
export function AudioControl({audio}:{audio:{state:AudioState;toggle:()=>void}}){
  const text={locked:'Enable sound',ready:'Sound on',muted:'Sound off',blocked:'Enable sound again',unavailable:'Sound unavailable'};
  return <div className="audio-control"><button type="button" className="audio-button" aria-pressed={audio.state==='ready'} data-audio-state={audio.state} disabled={audio.state==='unavailable'} onClick={audio.toggle}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 9h4l5-5v16l-5-5H3Z"/>{audio.state==='ready'?<path d="M16 7c3 3 3 7 0 10m3-13c5 5 5 11 0 16"/>:<path d="m16 9 6 6m0-6-6 6"/>}</svg>{text[audio.state]}</button>{['blocked','unavailable'].includes(audio.state)&&<small role="status">Visual warnings are still available.</small>}</div>;
}
export function RunHud({view,tier,online=false}:{view:SimView;tier:number;online?:boolean}){
  const target=tierTarget(tier,view.nearMisses);
  return <><div className="race-hud"><div><small>Time left</small><strong>{Math.ceil((RUN_TICKS-view.tick)/TICK_RATE)}<span> s</span></strong></div><div><small>Speed</small><strong>{toKmh(view.player.speed)}<span> km/h</span></strong></div><div><small>Local near misses</small><strong>{view.nearMisses}{target&&<span> /{target.required}</span>}</strong></div><div><small>{online?'Coins from sim':'Practice coins'}</small><strong>{view.coins.toLocaleString('en-US')}</strong></div></div></>;
}
export function RunWarnings({view,enabled}:{view:SimView;enabled:boolean}){
  const warnings=enabled?warningViews(view):[];
  return <div className="warning-stack">{warnings.map(w=><div className={`warning-card warning-${w.kind.toLowerCase()}`} key={`${w.id}:${w.activeTick}`} data-warning-kind={w.kind} data-warning-seconds={w.seconds} role="status"><WarningIcon kind={w.kind}/><div><strong>{names[w.kind]}</strong><span>{w.laneLabel}</span></div><b>{w.seconds}<small>s</small></b></div>)}</div>;
}
export function CoinPops({runner}:{runner:LocalRunner}){
  return <div className="coin-pops" aria-label="Latest local near misses">{nearMissPops(runner.events,runner.current.tick).map(event=><span key={`${event.index}:${event.tick}`} className="coin-pop" data-local-coins={event.coins}>+{event.coins}<small>local near miss #{event.index}</small></span>)}</div>;
}
/** Hitung mundur besar 5..1 di akhir batas waktu run. Angka berganti tiap detik (key) agar animasinya diulang. */
export function FinalCountdown({view,enabled}:{view:SimView;enabled:boolean}){
  const seconds=enabled?finalCountdown(view):null;if(seconds===null)return null;
  return <div className="final-countdown" role="timer" aria-live="off" aria-label={`${seconds} seconds remaining`}><span key={seconds} data-final-seconds={seconds}>{seconds}</span></div>;
}
