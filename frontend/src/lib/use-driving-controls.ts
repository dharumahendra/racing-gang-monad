import { useEffect, useMemo } from 'react';
import type { PlayerInputKind } from '@racing-gang/config';
import type { LocalRunner } from './runner';
import { bindDrivingKeyboard, HeldDrivingInputs } from './driving-input';
export function useDrivingControls(runner:LocalRunner,input?:(kind:PlayerInputKind)=>void) {
  const held=useMemo(()=>new HeldDrivingInputs(
    input||((kind:PlayerInputKind)=>runner.input(kind)),
    ()=>runner.phase==='running',
    ()=>runner.phase==='countdown'||runner.phase==='running',
  ),[runner,input]);
  useEffect(()=>{
    const stopKeyboard=bindDrivingKeyboard(window,document,held);
    const stopRunning=runner.onRunning(()=>held.flush());
    if(runner.phase==='running')held.flush();
    return()=>{stopRunning();stopKeyboard();};
  },[runner,held]);
  const phase=runner.phase;
  useEffect(()=>{
    if(phase==='idle'||phase==='ended')held.releaseAll();
  },[held,phase]);
  return held;
}
