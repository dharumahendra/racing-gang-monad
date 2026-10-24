import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalRunner } from './runner';
import { warningViews } from './hud';
import { WarningAudio, type AudioState } from './warning-audio';
const preference='racing-gang:warning-muted';
export function useWarningAudio(runner:LocalRunner,revision:number,enabled=true){
  const [engine]=useState(()=>{const audio=new WarningAudio();try{audio.setMuted(localStorage.getItem(preference)==='true');}catch{/* Optional preference only. */}return audio;});
  const [state,setState]=useState<AudioState>(engine.state);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;engine.dispose();};},[engine]);
  useEffect(()=>{engine.resetRun();return()=>engine.silence();},[engine,runner]);
  useEffect(()=>{const update=()=>{const warnings=warningViews(runner.current).map(w=>({...w,remainingMs:Math.max(0,w.remainingMs-runner.accumulator)}));engine.update(warnings,enabled&&runner.phase==='running',document.visibilityState!=='hidden');setState(engine.state);};update();document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[engine,runner,revision,enabled]);
  const unlock=useCallback(()=>{void engine.unlock().then(()=>{if(mounted.current)setState(engine.state);});},[engine]);
  const toggle=useCallback(()=>{const mute=engine.state==='ready';engine.setMuted(mute);try{localStorage.setItem(preference,String(mute));}catch{/* Storage unavailable: keep in-memory control. */}setState(engine.state);if(!mute)unlock();},[engine,unlock]);
  return {state,unlock,toggle};
}
