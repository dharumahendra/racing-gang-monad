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

// --- Regresi: tombol yang ditahan selama hitung mundur harus langsung berlaku saat GO ---
// Membungkus HeldDrivingInputs persis seperti useDrivingControls: active = running, trackable = countdown|running,
// dan flush() dipanggil saat fase berpindah ke running.
function harness(){
 const sent:number[]=[];let phase:'idle'|'countdown'|'running'|'ended'='idle';
 const held=new HeldDrivingInputs(k=>sent.push(k),()=>phase==='running',()=>phase==='countdown'||phase==='running');
 return {sent,held,set(next:typeof phase){phase=next;if(next==='running')held.flush();else held.releaseAll();}};
}
it('applies a key held during countdown the moment the run starts, without a re-press',()=>{
 const h=harness();h.set('countdown');
 h.held.press('key:ArrowLeft',EntryKind.LEFT);
 expect(h.sent).toEqual([]); // belum running: dicatat tapi belum dikirim
 h.set('running');
 expect(h.sent).toEqual([EntryKind.LEFT]); // flush menerapkan tahanan tepat saat GO
 h.held.release('key:ArrowLeft');
 expect(h.sent).toEqual([EntryKind.LEFT,EntryKind.LEFT_OFF]);
});
it('applies a touch/pointer hold from countdown at GO, and OFF fires only once on release',()=>{
 const h=harness();h.set('countdown');
 h.held.press('pointer:1',EntryKind.RIGHT);h.set('running');
 expect(h.sent).toEqual([EntryKind.RIGHT]);
 h.held.release('pointer:1');h.held.release('pointer:1');
 expect(h.sent).toEqual([EntryKind.RIGHT,EntryKind.RIGHT_OFF]);
});
it('does not reactivate an input released or blurred during countdown',()=>{
 const h=harness();h.set('countdown');
 h.held.press('key:ArrowLeft',EntryKind.LEFT);h.held.release('key:ArrowLeft'); // dilepas sebelum GO
 h.held.press('pointer:9',EntryKind.RIGHT);h.held.releaseAll();               // dibatalkan (blur/pindah tab)
 h.set('running');
 expect(h.sent).toEqual([]); // tidak ada yang ditahan saat GO → tidak ada input hantu
});
it('does not double-dispatch when the same action is held from several sources across GO',()=>{
 const h=harness();h.set('countdown');
 h.held.press('key:ArrowLeft',EntryKind.LEFT);h.held.press('pointer:1',EntryKind.LEFT);
 h.set('running');
 expect(h.sent).toEqual([EntryKind.LEFT]); // satu ON walau dua sumber menahan aksi sama
 h.held.release('key:ArrowLeft');
 expect(h.sent).toEqual([EntryKind.LEFT]); // masih ditahan pointer: belum OFF
 h.held.release('pointer:1');
 expect(h.sent).toEqual([EntryKind.LEFT,EntryKind.LEFT_OFF]);
});
it('ignores presses while idle so nothing leaks into the next run',()=>{
 const h=harness(); // mulai idle
 h.held.press('key:ArrowLeft',EntryKind.LEFT); // idle: tidak trackable
 h.set('countdown');h.set('running');
 expect(h.sent).toEqual([]);
});
it('end-to-end: a hold entered during the LocalRunner countdown steers from the first running tick',()=>{
 const runner=new LocalRunner(params);runner.start(); // fase countdown
 const held=new HeldDrivingInputs(k=>runner.input(k),()=>runner.phase==='running',()=>runner.phase==='countdown'||runner.phase==='running');
 held.press('pointer:1',EntryKind.RIGHT); // ditahan selama hitung mundur
 expect(runner.log).toEqual([]); // input belum masuk log saat countdown
 runner.advance(COUNTDOWN_MS); // habiskan hitung mundur → running
 held.flush(); // seperti useDrivingControls saat fase jadi running
 const before=runner.current.player.x;runner.advance(200);
 expect(runner.current.player.x).toBeGreaterThan(before); // langsung menyetir tanpa re-press
 expect(runner.log.map(e=>e.kind)).toEqual([EntryKind.RIGHT]);
});

// The frame crossing GO must apply held controls before consuming any game tick.
it.each([EntryKind.RIGHT,EntryKind.BRAKE_ON,EntryKind.ACCEL_ON])('applies countdown hold %s at tick 1 when a frame crosses GO',kind=>{
 const runner=new LocalRunner(params);runner.start();
 const held=new HeldDrivingInputs(k=>runner.input(k),()=>runner.phase==='running',()=>runner.phase==='countdown'||runner.phase==='running');
 const stop=runner.onRunning(()=>held.flush());
 held.press('pointer:1',kind);
 runner.advance(COUNTDOWN_MS-10);runner.advance(100);
 expect(runner.current.tick).toBe(2);
 expect(runner.log.map(e=>[e.tick,e.kind])).toEqual([[1,kind]]);
 expect(kind===EntryKind.RIGHT?runner.current.player.steer:kind===EntryKind.BRAKE_ON?runner.current.player.braking:runner.current.player.accelerating).toBe(kind===EntryKind.RIGHT?1:true);
 stop();held.releaseAll();
});
it('does not resurrect a cancelled countdown hold at the synchronous GO boundary',()=>{
 const runner=new LocalRunner(params);runner.start();
 const held=new HeldDrivingInputs(k=>runner.input(k),()=>runner.phase==='running',()=>runner.phase==='countdown'||runner.phase==='running');
 const stop=runner.onRunning(()=>held.flush());
 held.press('key:ArrowRight',EntryKind.RIGHT);held.releaseAll();runner.advance(COUNTDOWN_MS+100);
 expect(runner.log).toEqual([]);expect(runner.current.player.steer).toBe(0);stop();
});

it('tracks both gas aliases during countdown and sends ACCEL_OFF only after the last release',()=>{
 const runner=new LocalRunner(params);runner.start();
 const held=new HeldDrivingInputs(k=>runner.input(k),()=>runner.phase==='running',()=>runner.phase==='countdown'||runner.phase==='running');
 const off=runner.onRunning(()=>held.flush());const win=new EventTarget(),doc=new EventTarget();const stop=bindDrivingKeyboard(win,doc,held);
 key(win,'keydown','ArrowUp');key(win,'keydown','KeyW');key(win,'keydown','ArrowUp',true);
 runner.advance(COUNTDOWN_MS+100);expect(runner.current.player.accelerating).toBe(true);
 key(win,'keyup','ArrowUp');runner.advance(34);expect(runner.current.player.accelerating).toBe(true);
 key(win,'keyup','KeyW');runner.advance(34);expect(runner.current.player.accelerating).toBe(false);
 expect(runner.log.map(e=>[e.tick,e.kind])).toEqual([[1,EntryKind.ACCEL_ON],[5,EntryKind.ACCEL_OFF]]);
 stop();off();
});
