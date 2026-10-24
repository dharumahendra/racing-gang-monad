import { expect, it } from 'vitest';
import { EntryKind } from '@racing-gang/config';
import { replay, Sim } from '@racing-gang/sim';
import { PlayClient, type SocketPort } from './play-client';
const params={runId:`0x${'11'.repeat(32)}` as const,seed:`0x${'22'.repeat(32)}` as const,carTier:0};
class Socket implements SocketPort {
  readyState=0;sent:any[]=[];events=new Map<string,((e:any)=>void)[]>();
  addEventListener(type:string,fn:(e:any)=>void){this.events.set(type,[...(this.events.get(type)||[]),fn]);}
  send(data:string){this.sent.push(JSON.parse(data));} close(){this.readyState=3;this.fire('close',{});}
  fire(type:string,e:any){for(const fn of this.events.get(type)||[])fn(e);}
  open(){this.readyState=1;this.fire('open',{});} receive(data:unknown){this.fire('message',{data:JSON.stringify(data)});}
}
async function setup(){let now=1000;const sockets:Socket[]=[];const client=new PlayClient(params,'ws://localhost/ws/play',()=>now,()=>{const s=new Socket();sockets.push(s);return s;});await client.connect(async()=> 'test');const socket=sockets[0];socket.open();const ping=socket.sent.find(m=>m.t==='ping');socket.receive({t:'pong',clientMs:ping.clientMs,serverMs:10000});return {client,socket,sockets,setTime:(n:number)=>{now=n;},go:()=>socket.receive({t:'run.go',startAt:13000})};}
it('waits for an echoed clock sample before ready and uses server startAt, not arrival time',async()=>{
  const f=await setup();expect(f.socket.sent.filter(m=>m.t==='run.ready')).toEqual([{t:'run.ready',runId:params.runId}]);f.go();
  f.setTime(3500);f.client.pump();expect(f.client.runner.current.tick).toBe(0);expect(f.client.runner.countdownMs).toBe(500);
  f.setTime(4100);f.client.pump();expect(f.client.runner.current.tick).toBe(3);f.client.dispose();
});
it('sends next-tick inputs before the watermark that covers them, then snapshot at 10 Hz',async()=>{
  const f=await setup();f.go();f.setTime(4000);f.client.pump();f.client.input(EntryKind.RIGHT);f.setTime(4100);f.client.pump();
  const input=f.socket.sent.findIndex(m=>m.t==='input');const mark=f.socket.sent.findIndex((m,i)=>i>input&&m.t==='watermark'&&m.tick>=1);
  expect(f.socket.sent[input]).toMatchObject({tick:1,kind:2,seq:1});expect(mark).toBeGreaterThan(input);
  expect(f.socket.sent.at(-1)).toMatchObject({t:'snapshot',tick:3,targetLane:2});f.client.dispose();
});
it('schedules SPEC at warnTick once, preserves hash parity, and rejects late delivery',async()=>{
  const f=await setup();f.go();f.setTime(4000);f.client.pump();
  const event={t:'disruption.scheduled',id:'d1',kind:'SPIKES',lanes:[0],warnTick:3,by:'Ana'};
  f.socket.receive(event);f.socket.receive(event);expect(f.socket.sent.filter(m=>m.t==='disruption.ack')).toEqual([{t:'disruption.ack',id:'d1',applied:true}]);
  f.client.input(EntryKind.RIGHT);f.setTime(4200);f.client.pump();expect(f.client.runner.log.filter(e=>e.kind===11)).toHaveLength(1);
  f.socket.receive({...event,id:'late'});expect(f.socket.sent.at(-1)).toEqual({t:'disruption.ack',id:'late',applied:false});
  const result=replay({...params,entries:f.client.runner.log});const check=new (f.client.runner.sim.constructor as any)(params);for(let t=1;t<=f.client.runner.current.tick;t++)check.step(f.client.runner.log.filter(e=>e.tick===t));expect(check.inputHash).toBe(f.client.runner.sim.inputHash);expect(result.finalHash).toBeDefined();f.client.dispose();
});
it('buffers input during disconnect, flushes it before a new watermark and obtains a fresh token',async()=>{
  const f=await setup();f.go();f.setTime(4000);f.client.pump();f.socket.close();f.client.input(EntryKind.BRAKE_ON);f.setTime(4200);f.client.pump();
  let calls=0;await f.client.connect(async()=>{calls++;return 'fresh';});const s=f.sockets[1];s.open();f.client.pump();
  expect(calls).toBe(1);const input=s.sent.findIndex(m=>m.t==='input');const watermark=s.sent.findIndex(m=>m.t==='watermark');expect(input).toBeGreaterThanOrEqual(0);expect(watermark).toBeGreaterThan(input);expect(s.sent.some(m=>m.t==='run.ready')).toBe(false);f.client.dispose();
});
it('does not trust a local result, sends run.end once and keeps official result separate',async()=>{
  const f=await setup();f.go();f.setTime(110000);f.client.pump();f.client.pump();expect(f.socket.sent.filter(m=>m.t==='run.end')).toHaveLength(1);expect(f.client.result).toBeNull();
  f.socket.receive({t:'run.result',status:'PARTIAL',reason:'CRASH',endTick:100,nearMisses:0,coins:0,qualifiedTiers:[]});expect(f.client.result?.status).toBe('PARTIAL');f.client.dispose();
});
it('ignores stale sockets and pending token resolution after disposal',async()=>{
  const f=await setup();f.go();f.client.dispose();f.socket.receive({t:'run.go',startAt:0});expect(f.client.status).toBe('closed');
  const sockets:Socket[]=[];const other=new PlayClient(params,'ws://localhost/ws/play',()=>0,()=>{const s=new Socket();sockets.push(s);return s;});
  let resolve!:(value:string)=>void;const pending=other.connect(()=>new Promise(r=>resolve=r));other.dispose();resolve('stale');await pending;expect(sockets).toHaveLength(0);
});
it('rejects malformed frames and duplicate go without rewinding the active simulation',async()=>{
  const f=await setup();f.go();f.setTime(4100);f.client.pump();const tick=f.client.runner.current.tick;f.socket.receive({t:'run.go',startAt:999999});expect(f.client.runner.current.tick).toBe(tick);
  f.socket.receive({t:'disruption.scheduled',id:'bad',kind:'RED',lanes:[9],warnTick:5,by:'x',durationIndex:0});expect(f.client.status).toBe('error');expect(f.client.runner.log).toHaveLength(0);f.client.dispose();
});
it('expires offline buffering after the shared grace period instead of retrying a new run',async()=>{
  const f=await setup();f.go();f.socket.close();f.setTime(32001);f.client.pump();expect(f.client.status).toBe('expired');await f.client.connect(async()=> 'new');expect(f.sockets).toHaveLength(1);f.client.dispose();
});
it('keeps the simulation running when chain recording fails',async()=>{
  const f=await setup();f.go();f.setTime(4100);f.client.pump();f.socket.receive({t:'error',code:'RECORD_FAILED',message:'rpc'});
  f.setTime(4200);f.client.pump();expect(f.client.status).toBe('running');expect(f.client.runner.current.tick).toBe(6);expect(f.client.error).toContain('Chain');f.client.dispose();
});
it('does not trust an unsolicited pong and does not publish snapshots faster than the configured cadence',async()=>{
  const f=await setup();f.go();f.setTime(4000);f.client.pump();const count=f.socket.sent.filter(m=>m.t==='snapshot').length;
  f.socket.receive({t:'pong',clientMs:42,serverMs:9999999});f.setTime(4020);f.client.pump();expect(f.socket.sent.filter(m=>m.t==='snapshot')).toHaveLength(count);expect(f.client.runner.current.tick).toBe(0);f.client.dispose();
});
it('repeats the original ack after reconnect when a disruption is replayed, without scheduling it again',async()=>{
  const f=await setup();f.go();const event={t:'disruption.scheduled',id:'replayed',kind:'SPIKES',lanes:[0],warnTick:3,by:'Ana'};f.socket.receive(event);
  f.socket.close();f.setTime(4200);f.client.pump();await f.client.connect(async()=> 'new');const socket=f.sockets[1];socket.open();socket.receive(event);
  expect(socket.sent.filter(m=>m.t==='disruption.ack')).toEqual([{t:'disruption.ack',id:'replayed',applied:true}]);expect(f.client.runner.log.filter(e=>e.kind===11)).toHaveLength(1);f.client.dispose();
});
it('keeps the first terminal result immutable while allowing late chain receipts',async()=>{
  const f=await setup();f.go();const result={t:'run.result',status:'PARTIAL',reason:'CRASH',endTick:100,nearMisses:0,coins:0,qualifiedTiers:[]};f.socket.receive(result);
  f.socket.receive({...result,status:'VERIFIED',coins:999});f.socket.receive({t:'error',code:'RUN_ENDED',message:'ended'});
  expect(f.client.result).toEqual(result);expect(f.client.status).toBe('result');
  f.socket.receive({t:'nearMiss.recorded',index:1,txHash:`0x${'33'.repeat(32)}`,blockNumber:2,latencyMs:5});expect(f.client.recorded.size).toBe(1);f.client.dispose();
});
it('repeats ready when reconnecting before go, requesting the same server startAt',async()=>{
  const f=await setup();f.socket.close();await f.client.connect(async()=> 'new');const s=f.sockets[1];s.open();const ping=s.sent.find(m=>m.t==='ping');s.receive({t:'pong',clientMs:ping.clientMs,serverMs:10000});
  expect(s.sent.filter(m=>m.t==='run.ready')).toEqual([{t:'run.ready',runId:params.runId}]);s.receive({t:'run.go',startAt:13000});expect(f.client.status).toBe('countdown');f.client.dispose();
});
it('does not bypass offline grace by reconnecting before the next pump',async()=>{
  const f=await setup();f.go();f.socket.close();f.setTime(32001);let tokens=0;await f.client.connect(async()=>{tokens++;return 'fresh';});expect(f.client.status).toBe('expired');expect(tokens).toBe(0);expect(f.sockets).toHaveLength(1);f.client.dispose();
});
it('expires when a fresh token resolves after grace instead of opening another socket',async()=>{
  const f=await setup();f.go();f.socket.close();f.setTime(2000);let resolve!:(v:string)=>void;const pending=f.client.connect(()=>new Promise(r=>{resolve=r;}));f.setTime(32001);resolve('fresh');await pending;expect(f.client.status).toBe('expired');expect(f.sockets).toHaveLength(1);f.client.dispose();
});
it('does not flush buffered input if reconnect opens after the grace period',async()=>{
  const f=await setup();f.go();f.socket.close();f.setTime(2000);await f.client.connect(async()=> 'fresh');const socket=f.sockets[1];f.setTime(32001);socket.open();expect(f.client.status).toBe('expired');expect(socket.readyState).toBe(3);expect(socket.sent).toEqual([]);f.client.dispose();
});
it('keeps the original outage deadline when a reconnect closes before opening',async()=>{
  const f=await setup();f.go();f.socket.close();f.setTime(2000);await f.client.connect(async()=> 'fresh');f.setTime(15000);f.sockets[1].close();f.setTime(32001);await f.client.connect(async()=> 'fresh');expect(f.client.status).toBe('expired');expect(f.sockets).toHaveLength(2);f.client.dispose();
});

it('uses the authoritative run.go seed before countdown without replacing the runner or mutating caller params',async()=>{
  const f=await setup();const runner=f.client.runner;const original=params.seed;const seed=`0x${'5e'.repeat(32)}` as const;
  f.socket.receive({t:'run.go',startAt:13000,seed});expect(f.client.runner).toBe(runner);expect(runner.sim.seed).toBe(seed);expect(f.client.params.seed).toBe(seed);expect(params.seed).toBe(original);
  f.setTime(4000);f.client.pump();f.client.input(EntryKind.RIGHT);f.setTime(4200);f.client.pump();
  const reference=new (runner.sim.constructor as any)({...params,seed});for(let tick=1;tick<=runner.current.tick;tick++)reference.step(runner.log.filter(e=>e.tick===tick));expect(runner.current).toEqual(reference.view());expect(runner.sim.inputHash).toBe(reference.inputHash);f.client.dispose();
});
it.each([null,'0x1234',7])('rejects a malformed authoritative seed %s before starting the simulation',async seed=>{
  const f=await setup();f.socket.receive({t:'run.go',startAt:13000,seed});expect(f.client.status).toBe('error');expect(f.client.runner.phase).toBe('idle');expect(f.client.runner.sim.seed).toBe(params.seed);f.client.dispose();
});
it('preserves the POST seed in local-seed mode and never rewinds an active runner on duplicate go',async()=>{
  const f=await setup();f.go();expect(f.client.runner.sim.seed).toBe(params.seed);f.setTime(4200);f.client.pump();const view=f.client.runner.current;
  f.socket.receive({t:'run.go',startAt:13000,seed:`0x${'5e'.repeat(32)}`});expect(f.client.runner.current).toBe(view);expect(f.client.runner.sim.seed).toBe(params.seed);f.client.dispose();
});
it('keeps the adopted seed and state when the reconnect replays run.go',async()=>{
  const f=await setup();const seed=`0x${'5e'.repeat(32)}`;f.socket.receive({t:'run.go',startAt:13000,seed});f.setTime(4200);f.client.pump();const tick=f.client.runner.current.tick;f.socket.close();await f.client.connect(async()=> 'fresh');const socket=f.sockets[1];socket.open();socket.receive({t:'run.go',startAt:13000,seed});expect(f.client.runner.sim.seed).toBe(seed);expect(f.client.runner.current.tick).toBe(tick);f.client.dispose();
});


it('flushes the terminal watermark before run.end even when the last publication was less than 100ms ago',async()=>{
 const f=await setup();f.go();const reference=new Sim(params);while(!reference.ended)reference.step([]);const endAt=4000+reference.tick*1000/30;
 f.setTime(endAt-10);f.client.pump();f.setTime(endAt+1);f.client.pump();const endIndex=f.socket.sent.findIndex(m=>m.t==='run.end');expect(endIndex).toBeGreaterThan(0);const marks=f.socket.sent.slice(0,endIndex).filter(m=>m.t==='watermark');expect(marks.at(-1).tick).toBe(f.socket.sent[endIndex].tick);f.client.dispose();
});
it('sends one random page key on every (re)connect and stops for NOT_CONTROLLER instead of reconnecting',async()=>{
  const urls:string[]=[];const sockets:Socket[]=[];const client=new PlayClient(params,'ws://localhost/ws/play',()=>1000,url=>{urls.push(url);const s=new Socket();sockets.push(s);return s;});
  await client.connect(async()=> 'tok');sockets[0].open();sockets[0].close();await client.connect(async()=> 'tok');
  const keys=urls.map(u=>new URL(u).searchParams.get('client'));expect(keys[0]).toMatch(/^[0-9a-f]{36}$/);expect(keys[1]).toBe(keys[0]);
  expect(new PlayClient(params,'ws://localhost/ws/play').clientKey).not.toBe(keys[0]);
  sockets[1].open();sockets[1].receive({t:'error',code:'NOT_CONTROLLER',message:'x'});
  expect(client.status).toBe('error');expect(client.error).toContain('another tab or device');
  await client.connect(async()=> 'tok');expect(sockets).toHaveLength(2);client.dispose();
});
it('keeps run.qualified events (even after the result) for the Garage hint',async()=>{
  const f=await setup();f.go();f.socket.receive({t:'run.result',status:'VERIFIED',reason:'TIME_UP',endTick:3000,nearMisses:40,coins:4000,qualifiedTiers:[1]});
  f.socket.receive({t:'run.qualified',tier:1,txHash:`0x${'aa'.repeat(32)}`});
  expect([...f.client.qualified.keys()]).toEqual([1]);expect(f.client.status).toBe('result');f.client.dispose();
});
