import { useEffect } from 'react';
import { EntryKind, type PlayerInputKind } from '@racing-gang/config';
import type { LocalRunner } from './runner';
// Setiap aksi punya kode tekan dan lepas; sim menggeser mobil selama setir ditahan (CONFIG_VERSION 2).
type Action={on:PlayerInputKind;off:PlayerInputKind};
const LEFT:Action={on:EntryKind.LEFT,off:EntryKind.LEFT_OFF},RIGHT:Action={on:EntryKind.RIGHT,off:EntryKind.RIGHT_OFF},BRAKE:Action={on:EntryKind.BRAKE_ON,off:EntryKind.BRAKE_OFF};
const controls:Record<string,Action>={ArrowLeft:LEFT,KeyA:LEFT,ArrowRight:RIGHT,KeyD:RIGHT,ArrowDown:BRAKE,KeyS:BRAKE};
export function useDrivingControls(runner:LocalRunner,input?:(kind:PlayerInputKind)=>void){
  useEffect(()=>{
    const send=input||((kind:PlayerInputKind)=>runner.input(kind));
    // Tombol fisik yang sedang ditahan per aksi: ArrowLeft dan A sama-sama kiri, lepas baru dikirim saat keduanya dilepas.
    const held=new Map<Action,Set<string>>([[LEFT,new Set()],[RIGHT,new Set()],[BRAKE,new Set()]]);
    const release=()=>{for(const [action,keys] of held)if(keys.size){keys.clear();send(action.off);}};
    const down=(e:KeyboardEvent)=>{if(runner.phase!=='running'||/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName))return;const action=controls[e.code];if(!action)return;e.preventDefault();if(e.repeat)return;const keys=held.get(action)!;keys.add(e.code);if(keys.size===1)send(action.on);};
    const up=(e:KeyboardEvent)=>{const action=controls[e.code];if(!action)return;const keys=held.get(action)!;if(!keys.delete(e.code))return;if(!keys.size)send(action.off);};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',release);document.addEventListener('visibilitychange',release);
    return()=>{release();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',release);document.removeEventListener('visibilitychange',release);};
  },[runner,input]);
}
