import { expect, it } from 'vitest';
import { RunLaunch } from './run-launch';
const defer=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};};
it('invalidates an in-flight POST on logout and disposes its late client',async()=>{
  const launch=new RunLaunch();const pending=defer<{dispose:()=>void}>();let closed=0;let signal!:AbortSignal;
  const result=launch.begin(async()=> 'token',async(_token,s)=>{signal=s;return pending.promise;});
  await Promise.resolve();launch.invalidate();expect(signal.aborted).toBe(true);
  pending.resolve({dispose:()=>closed++});expect(await result).toBeNull();expect(closed).toBe(1);
});
it('does not POST after a stale token resolves and does not submit twice while pending',async()=>{
  const launch=new RunLaunch();const token=defer<string>();let posts=0;
  const make=async()=>{posts++;return {dispose(){}};};const first=launch.begin(()=>token.promise,make);
  expect(await launch.begin(async()=> 'other',make)).toBeNull();launch.invalidate();token.resolve('old');expect(await first).toBeNull();expect(posts).toBe(0);
});
it('closes an active client and permits a new explicitly authorized attempt after invalidation',async()=>{
  const launch=new RunLaunch();let closed=0;const client={dispose:()=>closed++};
  expect(await launch.begin(async()=> 'first',async()=>client)).toBe(client);launch.invalidate();expect(closed).toBe(1);
  const next={dispose(){}};expect(await launch.begin(async()=> 'second',async()=>next)).toBe(next);launch.invalidate();
});
