import { expect, it, vi } from 'vitest';
import { WarningAudio } from './warning-audio';
import type { HudWarning } from './hud';
const warning=(seconds=2,kind:HudWarning['kind']='SPIKES'):HudWarning=>({id:'one',kind,seconds,remainingMs:seconds*1000,laneLabel:'Lajur 1',activeTick:60,lanes:[0]});
function host(){const voices:any[]=[];const context={state:'suspended',currentTime:0,destination:{},resume:vi.fn(async()=>{context.state='running';}),close:vi.fn(async()=>{context.state='closed';}),createGain:()=>({gain:{setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()}),createOscillator:()=>{const voice={frequency:{setValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),onended:null};voices.push(voice);return voice;}};const factory=vi.fn(()=>context as unknown as AudioContext);return {context,voices,factory};}
it('creates no audio before a user unlock, then resumes from the explicit gesture',async()=>{
  const h=host();const audio=new WarningAudio(h.factory);audio.update([warning()],true,true);expect(h.factory).not.toHaveBeenCalled();expect(audio.state).toBe('locked');
  await audio.unlock();expect(h.factory).toHaveBeenCalledTimes(1);expect(h.context.resume).toHaveBeenCalledTimes(1);expect(audio.state).toBe('ready');audio.dispose();
});
it('plays each countdown stage once and never queues a burst of missed stages',async()=>{
  const h=host();const audio=new WarningAudio(h.factory);await audio.unlock();audio.update([warning()],true,true);const n=h.voices.length;expect(n).toBeGreaterThan(0);audio.update([warning()],true,true);expect(h.voices).toHaveLength(n);audio.update([warning(1)],true,true);expect(h.voices).toHaveLength(n*2);audio.update([],true,true);expect(h.voices).toHaveLength(n*2);audio.dispose();
});
it('mute immediately stops active nodes and suppresses their repeat after unmuting',async()=>{
  const h=host();const audio=new WarningAudio(h.factory);await audio.unlock();audio.update([warning()],true,true);audio.setMuted(true);expect(h.voices.every(v=>v.stop.mock.calls.length>=2)).toBe(true);const n=h.voices.length;audio.update([warning(1)],true,true);audio.setMuted(false);audio.update([warning(1)],true,true);expect(h.voices).toHaveLength(n);audio.dispose();
});
it('hidden, ended and retry cleanup stop sounds; a new run can warn again',async()=>{
  const h=host();const audio=new WarningAudio(h.factory);await audio.unlock();audio.update([warning()],true,true);const n=h.voices.length;audio.update([warning(1)],true,false);audio.update([warning(1)],true,true);expect(h.voices).toHaveLength(n);audio.update([],false,true);audio.resetRun();audio.update([warning()],true,true);expect(h.voices).toHaveLength(n*2);audio.dispose();expect(h.context.close).toHaveBeenCalledTimes(1);
});
it('fails gracefully when audio is unsupported or resume is blocked',async()=>{
  const unsupported=new WarningAudio(()=>{throw new Error('no audio');});await expect(unsupported.unlock()).resolves.toBeUndefined();expect(unsupported.state).toBe('unavailable');
  const h=host();h.context.resume.mockRejectedValueOnce(new Error('blocked'));const audio=new WarningAudio(h.factory);await audio.unlock();expect(audio.state).toBe('blocked');await audio.unlock();expect(audio.state).toBe('ready');audio.dispose();
});
it('keeps pending unlock from reopening audio after disposal',async()=>{
  const h=host();let finish!:()=>void;h.context.resume.mockImplementationOnce(()=>new Promise<void>(r=>finish=r));const audio=new WarningAudio(h.factory);const pending=audio.unlock();audio.dispose();finish();await pending;expect(audio.state).toBe('locked');expect(h.context.close).toHaveBeenCalledTimes(1);
});
it('cancels a warning voice as soon as it is no longer pending, while the game keeps running',async()=>{
  const h=host();const audio=new WarningAudio(h.factory);await audio.unlock();audio.update([warning(1)],true,true);expect(h.voices).toHaveLength(2);audio.update([],true,true);expect(h.voices.every(v=>v.stop.mock.calls.length>=2)).toBe(true);audio.dispose();
});
it('does not schedule a second tone beyond a warning deadline near its activation tick',async()=>{
  const h=host();const audio=new WarningAudio(h.factory);await audio.unlock();audio.update([{...warning(1),remainingMs:1000/30} as HudWarning],true,true);expect(h.voices).toHaveLength(1);expect(h.voices[0].stop.mock.calls[0][0]).toBeLessThanOrEqual(1/30);audio.dispose();
});
