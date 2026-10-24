import { useEffect, useMemo } from 'react';
import type { PlayerInputKind } from '@racing-gang/config';
import type { LocalRunner } from './runner';
import { bindDrivingKeyboard, HeldDrivingInputs } from './driving-input';
export function useDrivingControls(runner:LocalRunner,input?:(kind:PlayerInputKind)=>void) {
  const held=useMemo(()=>new HeldDrivingInputs(input||((kind:PlayerInputKind)=>runner.input(kind)),()=>runner.phase==='running'),[runner,input]);
  useEffect(()=>bindDrivingKeyboard(window,document,held),[held]);
  const phase=runner.phase;
  useEffect(()=>{if(phase!=='running')held.releaseAll();},[held,phase]);
  return held;
}
