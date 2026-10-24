import { expect, it } from 'vitest';
import { EntryKind, COUNTDOWN_MS } from '@racing-gang/config';
import { HeldDrivingInputs, bindDrivingKeyboard, pointerDrivingHandlers } from './driving-input';
import { LocalRunner } from './runner';
const params={runId:('0x'+'11'.repeat(32)) as `0x${string}`,seed:('0x'+'22'.repeat(32)) as `0x${string}`,carTier:0};
function key(target:EventTarget,type:string,code:string,repeat=false,tagName='DIV'){
 const event=new Event(type,{cancelable:true});Object.assign(event,{code,repeat});Object.defineProperty(event,'target',{value:{tagName}});target.dispatchEvent(event);return event;
}
it('ignores repeat and sends OFF only after both aliases are released',()=>{
 const sent:number[]=[];const held=new HeldDrivingInputs(k=>sent.push(k),()=>true);const win=new EventTarget(),doc=new EventTarget();
 const stop=bindDrivingKeyboard(win,doc,held);
 key(win,'keydown','ArrowLeft');key(win,'keydown','ArrowLeft',true);key(win,'keydown','KeyA');
 key(win,'keyup','ArrowLeft');expect(sent).toEqual([EntryKind.LEFT]);key(win,'keyup','KeyA');
 expect(sent).toEqual([EntryKind.LEFT,EntryKind.LEFT_OFF]);stop();
});
it('window blur, visibility and cleanup release only held actions once',()=>{
 const sent:number[]=[];const held=new HeldDrivingInputs(k=>sent.push(k),()=>true);const win=new EventTarget(),doc=new EventTarget();const stop=bindDrivingKeyboard(win,doc,held);
 key(win,'keydown','ArrowLeft');key(win,'keydown','ArrowRight');key(win,'keydown','ArrowDown');win.dispatchEvent(new Event('blur'));doc.dispatchEvent(new Event('visibilitychange'));
 expect(sent).toEqual([1,2,3,5,6,4]);key(win,'keydown','KeyD');stop();expect(sent.slice(-2)).toEqual([2,6]);key(win,'keydown','KeyD');expect(sent).toHaveLength(8);
});
it('keyboard and multiple pointer sources do not release each other',()=>{
 const sent:number[]=[];const held=new HeldDrivingInputs(k=>sent.push(k),()=>true);
 held.press('key:ArrowLeft',1);held.press('pointer:1',1);held.press('pointer:2',1);held.release('pointer:1');held.release('pointer:2');
 expect(sent).toEqual([1]);held.release('key:ArrowLeft');held.release('key:ArrowLeft');expect(sent).toEqual([1,5]);
});
it('does not press before running or while editing, but keyup always releases held input',()=>{
 let running=false;const sent:number[]=[];const held=new HeldDrivingInputs(k=>sent.push(k),()=>running);const win=new EventTarget(),doc=new EventTarget();const stop=bindDrivingKeyboard(win,doc,held);
 expect(key(win,'keydown','ArrowRight').defaultPrevented).toBe(false);running=true;key(win,'keydown','ArrowRight',false,'INPUT');expect(sent).toEqual([]);
 key(win,'keydown','ArrowRight');key(win,'keyup','ArrowRight',false,'INPUT');expect(sent).toEqual([2,6]);stop();
});
it('held steering moves and release stops between lane centres without snapping',()=>{
 const runner=new LocalRunner(params);runner.start();runner.advance(COUNTDOWN_MS);const held=new HeldDrivingInputs(k=>runner.input(k),()=>runner.phase==='running');
 const initial=runner.current.player.x;held.press('pointer:1',EntryKind.RIGHT);runner.advance(100);const moved=runner.current.player.x;expect(moved).toBeGreaterThan(initial);
 held.release('pointer:1');runner.advance(100);expect(runner.current.player.x).toBe(moved);expect(runner.current.player.steer).toBe(0);
 expect(runner.log.map(e=>e.kind)).toEqual([2,6]);
});



it.each(['onPointerUp','onPointerCancel','onPointerLeave','onLostPointerCapture'] as const)('pointer capture and %s release once',event=>{
 const sent:number[]=[];const held=new HeldDrivingInputs(k=>sent.push(k),()=>true);
 const captures=new Set<number>();
 const e={pointerId:7,button:0,preventDefault(){},currentTarget:{
  setPointerCapture(id:number){captures.add(id);},hasPointerCapture(id:number){return captures.has(id);},releasePointerCapture(id:number){captures.delete(id);},
 }};
 const handlers=pointerDrivingHandlers(held,EntryKind.LEFT);
 handlers.onPointerDown(e);handlers.onPointerDown(e);expect(captures.has(7)).toBe(true);
 handlers[event](e);handlers.onLostPointerCapture(e);
 expect(captures.size).toBe(0);expect(sent).toEqual([EntryKind.LEFT,EntryKind.LEFT_OFF]);
});
