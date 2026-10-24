import { useCallback, useEffect, useState } from 'react';
import type { LocalRunner } from './runner';
import { warningViews } from './hud';
import { WarningAudio, type AudioState } from './warning-audio';
import { EngineAudio } from './engine-audio';
import { CARS } from '@racing-gang/config';
const preference='racing-gang:warning-muted';
/**
 * Satu kontrol suara untuk run: nada peringatan gangguan (WarningAudio) + suara mesin & efek mepet (EngineAudio).
 * Keduanya berbagi satu unlock gesture, satu mute, dan dibersihkan bersama. State yang ditampilkan mengikuti
 * nada peringatan (sumber kebenaran untuk tombol), karena keduanya selalu diberi mute/unlock yang sama.
 */
export function useWarningAudio(runner:LocalRunner,revision:number,enabled=true){
  const [engines]=useState(()=>{
    const muted=(()=>{try{return localStorage.getItem(preference)==='true';}catch{return false;}})();
    const warning=new WarningAudio();const engine=new EngineAudio();
    warning.setMuted(muted);engine.setMuted(muted);
    return {warning,engine};
  });
  const {warning,engine}=engines;
  const [state,setState]=useState<AudioState>(warning.state);
  useEffect(()=>()=>{warning.dispose();engine.dispose();},[warning,engine]);
  useEffect(()=>{warning.resetRun();engine.resetRun();return()=>{warning.silence();engine.silence();};},[warning,engine,runner]);
  useEffect(()=>{
    const update=()=>{
      const playing=enabled&&runner.phase==='running';const visible=document.visibilityState!=='hidden';
      const warnings=warningViews(runner.current).map(w=>({...w,remainingMs:Math.max(0,w.remainingMs-runner.accumulator)}));
      warning.update(warnings,playing,visible);
      // Suara mesin dari kecepatan sim; batas atas dari shared config per tier yang dipakai run ini.
      const maxSpeed=CARS[runner.sim.carTier]?.maxSpeed??0;
      engine.engine(runner.current.player.speed,maxSpeed,playing,visible);
      for(const e of runner.events)if(e.type==='NEAR_MISS')engine.nearMiss(e.index,playing&&visible);
      setState(warning.state);
    };
    update();document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);
  },[warning,engine,runner,revision,enabled]);
  const unlock=useCallback(()=>{void Promise.all([warning.unlock(),engine.unlock()]).then(()=>setState(warning.state));},[warning,engine]);
  const toggle=useCallback(()=>{const mute=warning.state==='ready';warning.setMuted(mute);engine.setMuted(mute);try{localStorage.setItem(preference,String(mute));}catch{/* Storage unavailable: keep in-memory control. */}setState(warning.state);if(!mute)unlock();},[warning,engine,unlock]);
  return {state,unlock,toggle};
}
