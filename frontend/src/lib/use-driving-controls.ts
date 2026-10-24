import { useEffect } from 'react';
import { EntryKind, type PlayerInputKind } from '@racing-gang/config';
import type { LocalRunner } from './runner';
const controls:Record<string,PlayerInputKind>={ArrowLeft:EntryKind.LEFT,KeyA:EntryKind.LEFT,ArrowRight:EntryKind.RIGHT,KeyD:EntryKind.RIGHT,ArrowDown:EntryKind.BRAKE_ON,KeyS:EntryKind.BRAKE_ON};
export function useDrivingControls(runner:LocalRunner,input?:(kind:PlayerInputKind)=>void){
  useEffect(()=>{
    const send=input||((kind:PlayerInputKind)=>runner.input(kind));const brakes=new Set<string>();
    const release=()=>{if(brakes.size){brakes.clear();send(EntryKind.BRAKE_OFF);}};
    const down=(e:KeyboardEvent)=>{if(runner.phase!=='running'||/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName))return;const kind=controls[e.code];if(!kind)return;e.preventDefault();if(e.repeat)return;if(kind===EntryKind.BRAKE_ON){brakes.add(e.code);if(brakes.size>1)return;}send(kind);};
    const up=(e:KeyboardEvent)=>{if(controls[e.code]!==EntryKind.BRAKE_ON)return;brakes.delete(e.code);if(!brakes.size)send(EntryKind.BRAKE_OFF);};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',release);document.addEventListener('visibilitychange',release);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',release);document.removeEventListener('visibilitychange',release);};
  },[runner,input]);
}
