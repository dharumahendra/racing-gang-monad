import { EntryKind, type PlayerInputKind } from '@racing-gang/config';
export type HoldKind = typeof EntryKind.LEFT | typeof EntryKind.RIGHT | typeof EntryKind.BRAKE_ON | typeof EntryKind.ACCEL_ON;
const offFor: Record<HoldKind, PlayerInputKind> = {1:EntryKind.LEFT_OFF,2:EntryKind.RIGHT_OFF,3:EntryKind.BRAKE_OFF,7:EntryKind.ACCEL_OFF};
const keys: Record<string, HoldKind> = {ArrowLeft:EntryKind.LEFT,KeyA:EntryKind.LEFT,ArrowRight:EntryKind.RIGHT,KeyD:EntryKind.RIGHT,ArrowDown:EntryKind.BRAKE_ON,KeyS:EntryKind.BRAKE_ON,ArrowUp:EntryKind.ACCEL_ON,KeyW:EntryKind.ACCEL_ON};
/**
 * Sumber fisik dipisah: keyboard dan pointer yang menahan aksi sama tidak saling melepas.
 *
 * `active()` menentukan kapan input boleh dikirim ke simulasi (= fase running). Tombol yang ditahan
 * selama hitung mundur tetap dicatat tetapi belum dikirim; begitu run mulai, `flush()` menerapkan
 * semua aksi yang masih ditahan tanpa pemain perlu melepas lalu menekan lagi. Tombol yang sudah
 * dilepas atau dibatalkan (blur/pindah tab) keluar dari peta sebelum flush, jadi tidak aktif kembali.
 */
export class HeldDrivingInputs {
  private held = new Map<string, HoldKind>();
  /** Aksi yang ON-nya sudah dikirim ke simulasi dan belum dikirim OFF. */
  private dispatched = new Set<HoldKind>();
  /**
   * @param active    Boleh kirim ke simulasi (fase running).
   * @param trackable Boleh mencatat tahanan tombol (hitung mundur atau running). Default = `active`.
   */
  constructor(private send: (kind:PlayerInputKind)=>void, private active:()=>boolean, private trackable:()=>boolean = active) {}
  /** Tombol boleh ditahan/dilepas selama trackable, supaya hold sebelum GO tercatat. */
  get enabled() { return this.trackable(); }
  private dispatch(kind:HoldKind) {
    if(this.active()&&!this.dispatched.has(kind)){this.dispatched.add(kind);this.send(kind);}
  }
  press(source:string,kind:HoldKind) {
    if(!this.trackable()||this.held.has(source))return;
    this.held.set(source,kind);this.dispatch(kind);
  }
  release(source:string) {
    const kind=this.held.get(source);if(kind===undefined)return;
    this.held.delete(source);
    if(![...this.held.values()].includes(kind)&&this.dispatched.delete(kind))this.send(offFor[kind]);
  }
  /** Dipanggil saat run mulai: terapkan aksi yang masih ditahan dari hitung mundur. */
  flush() {
    for(const kind of new Set(this.held.values()))this.dispatch(kind);
  }
  releaseAll() {
    const kinds=this.dispatched;this.held.clear();this.dispatched=new Set();for(const kind of kinds)this.send(offFor[kind]);
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
