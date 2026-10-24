import { EntryKind, type PlayerInputKind } from '@racing-gang/config';
export type HoldKind = typeof EntryKind.LEFT | typeof EntryKind.RIGHT | typeof EntryKind.BRAKE_ON;
const offFor: Record<HoldKind, PlayerInputKind> = {1:EntryKind.LEFT_OFF,2:EntryKind.RIGHT_OFF,3:EntryKind.BRAKE_OFF};
const keys: Record<string, HoldKind> = {ArrowLeft:EntryKind.LEFT,KeyA:EntryKind.LEFT,ArrowRight:EntryKind.RIGHT,KeyD:EntryKind.RIGHT,ArrowDown:EntryKind.BRAKE_ON,KeyS:EntryKind.BRAKE_ON};
/** Sumber fisik dipisah: keyboard dan pointer yang menahan aksi sama tidak saling melepas. */
export class HeldDrivingInputs {
  private held = new Map<string, HoldKind>();
  constructor(private send: (kind:PlayerInputKind)=>void, private active:()=>boolean) {}
  get enabled() { return this.active(); }
  press(source:string,kind:HoldKind) {
    if(!this.active() || this.held.has(source))return;
    const already=[...this.held.values()].includes(kind);
    this.held.set(source,kind);if(!already)this.send(kind);
  }
  release(source:string) {
    const kind=this.held.get(source);if(kind===undefined)return;
    this.held.delete(source);if(![...this.held.values()].includes(kind))this.send(offFor[kind]);
  }
  releaseAll() {
    const kinds=new Set(this.held.values());this.held.clear();for(const kind of kinds)this.send(offFor[kind]);
  }
}
export function bindDrivingKeyboard(win:EventTarget,doc:EventTarget,held:HeldDrivingInputs) {
  const down=(event:Event)=>{
    const e=event as KeyboardEvent,target=e.target as HTMLElement|null;
    if(target?.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target?.tagName||''))return;
    const kind=keys[e.code];if(!kind||!held.enabled)return;
    e.preventDefault();if(!e.repeat)held.press('key:'+e.code,kind);
  };
  const up=(event:Event)=>{const e=event as KeyboardEvent;if(keys[e.code])held.release('key:'+e.code);};
  const release=()=>held.releaseAll();
  win.addEventListener('keydown',down);win.addEventListener('keyup',up);win.addEventListener('blur',release);doc.addEventListener('visibilitychange',release);
  return ()=>{release();win.removeEventListener('keydown',down);win.removeEventListener('keyup',up);win.removeEventListener('blur',release);doc.removeEventListener('visibilitychange',release);};
}
type PointerInputEvent={pointerId:number;button:number;preventDefault:()=>void;currentTarget:Pick<HTMLElement,'setPointerCapture'|'hasPointerCapture'|'releasePointerCapture'>};
export function pointerDrivingHandlers(held:HeldDrivingInputs,kind:HoldKind) {
  const release=(e:PointerInputEvent)=>{
    held.release('pointer:'+e.pointerId);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return {
    onPointerDown:(e:PointerInputEvent)=>{if(e.button!==0||!held.enabled)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);held.press('pointer:'+e.pointerId,kind);},
    onPointerUp:release,onPointerCancel:release,onPointerLeave:release,onLostPointerCapture:release,
  };
}
