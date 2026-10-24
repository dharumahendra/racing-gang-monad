import { expect, it } from 'vitest';
import { EntryKind } from '@racing-gang/config';
import { replay } from '@racing-gang/sim';
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
  f.setTime(4200);f.client.pump();expect(f.client.status).toBe('running');expect(f.client.runner.current.tick).toBe(6);expect(f.client.error).toContain('chain');f.client.dispose();
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
