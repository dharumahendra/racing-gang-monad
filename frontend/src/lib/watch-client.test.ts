import { expect, it } from 'vitest';
import { WatchClient } from './watch-client';
import type { SocketPort } from './play-client';
class Socket implements SocketPort{readyState=0;sent:any[]=[];events=new Map<string,((e:any)=>void)[]>();addEventListener(t:string,f:(e:any)=>void){this.events.set(t,[...(this.events.get(t)||[]),f]);}fire(t:string,e:any){for(const f of this.events.get(t)||[])f(e);}send(s:string){this.sent.push(JSON.parse(s));}close(){this.readyState=3;this.fire('close',{});}open(){this.readyState=1;this.fire('open',{});}receive(m:unknown){this.fire('message',{data:JSON.stringify(m)});}}
const run={runId:`0x${'11'.repeat(32)}` as const,seed:`0x${'22'.repeat(32)}` as const,carTier:0,startAt:500};
const room={t:'room.state',code:'AB7K2M',expiresAt:50000,spectators:2,run};
function setup(){let now=1000;let url='';const sockets:Socket[]=[];const client=new WatchClient('ws://game.test','AB7K2M','Ana & Ben',()=>now,u=>{url=u;const s=new Socket();sockets.push(s);return s;});client.connect();const s=sockets[0];s.open();s.receive(room);s.receive({t:'energy',value:100});return {client,s,sockets,getUrl:()=>url,time:(t:number)=>{now=t;}};}
it('connects publicly with encoded room/nick, never a bearer or wallet',()=>{
  const f=setup();const url=new URL(f.getUrl());expect(url.pathname).toBe('/ws/watch');expect(url.searchParams.get('room')).toBe('AB7K2M');expect(url.searchParams.get('nick')).toBe('Ana & Ben');expect([...url.searchParams.keys()].sort()).toEqual(['nick','room']);expect(f.client.canSend('NITRO')).toBe(true);f.client.dispose();
});
it('sends exact lane/duration wire data once and waits for authoritative energy, never debiting locally',()=>{
  const f=setup();expect(f.client.send({kind:'RED',lane:2,durationIndex:1})).toBe(true);expect(f.client.send({kind:'NITRO'})).toBe(false);expect(f.s.sent).toEqual([{t:'disrupt',kind:'RED',lane:2,durationIndex:1}]);expect(f.client.energy).toBe(100);
  f.s.receive({t:'disrupt.accepted',id:'a'});f.time(1200);expect(f.client.canSend('NITRO')).toBe(false);f.s.receive({t:'energy',value:40.5});expect(f.client.canSend('NITRO')).toBe(true);expect(f.client.canSend('RED',1)).toBe(false);expect(f.client.feedback).toContain('Received by server');f.client.dispose();
});
it('does not regenerate energy, send without a run, or accept invalid lane/duration',()=>{
  const f=setup();f.s.receive({t:'energy',value:0});f.time(12000);f.client.pump();expect(f.client.energy).toBe(0);expect(f.client.send({kind:'SPIKES',lane:0})).toBe(false);f.s.receive({t:'energy',value:100});expect(f.client.send({kind:'RED',lane:4,durationIndex:0})).toBe(false);expect(f.client.send({kind:'RED',lane:1,durationIndex:9 as any})).toBe(false);f.s.receive({...room,run:null});expect(f.client.canSend('NITRO')).toBe(false);f.client.dispose();
});
it('shows rejection without inventing application and handles energy refusal by requesting fresh state',()=>{
  const f=setup();f.client.send({kind:'SPIKES',lane:1});f.s.receive({t:'disrupt.rejected',reason:'ENERGY'});expect(f.client.feedback).toContain('energy');expect(f.client.energy).toBeNull();f.s.receive({t:'energy',value:30});f.time(1200);expect(f.client.canSend('SPIKES')).toBe(false);f.client.dispose();
});
it('never replays a pending action after disconnect and ignores old socket messages',()=>{
  const f=setup();f.client.send({kind:'NITRO'});f.s.close();expect(f.client.feedback).toContain('unknown');f.client.connect();const s=f.sockets[1];s.open();s.receive(room);s.receive({t:'energy',value:70});f.s.receive({t:'disrupt.accepted',id:'old'});expect(s.sent).toEqual([]);expect(f.client.feedback).not.toContain('Received by server');f.client.dispose();
});
it('times out unknown acceptance without enabling a second command or resending it',()=>{
  const f=setup();f.client.send({kind:'NITRO'});f.time(6500);f.client.pump();expect(f.client.status).toBe('uncertain');expect(f.client.canSend('NITRO')).toBe(false);expect(f.s.sent).toHaveLength(1);f.client.dispose();
});
it('disables disruptions after room expiry but continues receiving active run snapshots/results',()=>{
  const f=setup();f.time(51000);f.client.pump();expect(f.client.canSend('NITRO')).toBe(false);f.s.receive({t:'run.snapshot',tick:20,x:525,z:2000,speed:100,targetLane:1,nearMisses:2});expect(f.client.snapshot?.tick).toBe(20);f.s.receive({t:'run.result',status:'PARTIAL',reason:'CRASH',endTick:20,nearMisses:2,coins:200,qualifiedTiers:[]});expect(f.client.result?.status).toBe('PARTIAL');f.client.dispose();
});
it('requires a fresh socket on the next run so untagged late events cannot corrupt its state',()=>{
  const f=setup();f.s.receive({t:'nearMiss.recorded',index:1,txHash:`0x${'33'.repeat(32)}`,blockNumber:3,latencyMs:12});f.s.receive({...room,run:{...run,runId:`0x${'44'.repeat(32)}`}});expect(f.client.status).toBe('changed');expect(f.client.canSend('NITRO')).toBe(false);f.s.receive({t:'run.result',status:'VERIFIED',reason:'TIME_UP',endTick:3000,nearMisses:999,coins:999,qualifiedTiers:[]});expect(f.client.result).toBeNull();f.client.connect();const s=f.sockets[1];s.open();s.receive({...room,run:{...run,runId:`0x${'44'.repeat(32)}`}});expect(f.client.recorded.size).toBe(0);f.client.dispose();
});
it('rejects wrong-room/malformed frames, ignores stale snapshots, and disposes connections',()=>{
  const f=setup();const snapshot={t:'run.snapshot',tick:10,x:525,z:2000,speed:100,targetLane:1,nearMisses:2};f.s.receive(snapshot);f.s.receive({...snapshot,tick:9});expect(f.client.snapshot?.tick).toBe(10);f.s.receive({...room,code:'ZZ9K2M'});expect(f.client.status).toBe('error');f.client.dispose();expect(f.s.readyState).toBe(3);
});
it('does not keep sending against a stale run after the server says NO_RUN',()=>{
  const f=setup();f.client.send({kind:'NITRO'});f.s.receive({t:'disrupt.rejected',reason:'NO_RUN'});f.time(1500);expect(f.client.canSend('NITRO')).toBe(false);f.s.receive({...room,run:null});expect(f.client.canSend('NITRO')).toBe(false);f.client.dispose();
});
it('keeps receiving an active run when server expiry resolves a pending command as unknown',()=>{
  const f=setup();f.client.send({kind:'NITRO'});f.s.receive({t:'error',code:'ROOM_EXPIRED',message:'Expired'});expect(f.client.pendingAction).toBe(false);expect(f.client.feedback).toContain('unknown');f.time(6501);f.client.pump();expect(f.client.status).toBe('ready');expect(f.s.readyState).toBe(1);expect(f.client.canSend('NITRO')).toBe(false);f.s.receive({t:'run.result',status:'PARTIAL',reason:'CRASH',endTick:20,nearMisses:2,coins:200,qualifiedTiers:[]});expect(f.client.result?.status).toBe('PARTIAL');expect(f.s.sent).toHaveLength(1);f.client.dispose();
});
it('preserves the active stream when a pending command times out after local expiry',()=>{
  const f=setup();f.s.receive({...room,expiresAt:2000});f.client.send({kind:'NITRO'});f.time(6501);f.client.pump();expect(f.client.status).toBe('ready');expect(f.client.pendingAction).toBe(false);expect(f.s.readyState).toBe(1);expect(f.client.canSend('NITRO')).toBe(false);expect(f.client.feedback).toContain('unknown');f.s.receive({t:'run.result',status:'PARTIAL',reason:'CRASH',endTick:20,nearMisses:2,coins:200,qualifiedTiers:[]});expect(f.client.result?.status).toBe('PARTIAL');f.client.dispose();
});
