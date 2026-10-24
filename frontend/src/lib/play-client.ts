import { EntryKind, NET, RUN_TICKS, encodeRedData, isPlayerInputKind, type PlayerInputKind } from '@racing-gang/config';
import type { PlayC2S, PlayS2C, RunResult, DisruptionScheduled } from '@racing-gang/config/protocol';
import type { SimParams } from '@racing-gang/sim';
import { LocalRunner } from './runner';

export type SocketPort={readyState:number;send(data:string):void;close():void;addEventListener(type:string,callback:(event:any)=>void):void};
type Status='idle'|'connecting'|'syncing'|'ready'|'countdown'|'running'|'disconnected'|'waiting_result'|'result'|'error'|'expired'|'closed';
const integer=(n:unknown,max=Number.MAX_SAFE_INTEGER)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=max;
const hex=(s:unknown)=>typeof s==='string'&&/^0x[\da-f]{64}$/i.test(s);
const text=(s:unknown)=>typeof s==='string'&&s.length>0&&s.length<=500;
const reason=(s:unknown)=>['TIME_UP','CRASH','RED_ZONE_FAIL','TIMEOUT'].includes(s as string);
function valid(m:any):m is PlayS2C {
  if(!m||typeof m!=='object')return false;
  switch(m.t){
    case 'pong':return integer(m.clientMs)&&integer(m.serverMs);
    case 'run.go':return integer(m.startAt)&&(m.seed===undefined||hex(m.seed));
    case 'disruption.scheduled':return text(m.id)&&typeof m.by==='string'&&m.by.length<=100&&integer(m.warnTick,RUN_TICKS)&&Array.isArray(m.lanes)&&m.lanes.every((n:unknown)=>integer(n,3))&&
      (m.kind==='NITRO'?m.lanes.length===0:m.kind==='SPIKES'?m.lanes.length===1:m.kind==='RED'&&m.lanes.length===1&&integer(m.durationIndex,2));
    case 'nearMiss.verified':return integer(m.index)&&m.index>0&&integer(m.tick,RUN_TICKS)&&integer(m.vehicleType,1)&&integer(m.coins);
    case 'nearMiss.recorded':return integer(m.index)&&m.index>0&&hex(m.txHash)&&integer(m.blockNumber)&&integer(m.latencyMs);
    case 'run.qualified':return integer(m.tier,4)&&hex(m.txHash);
    case 'run.result':return ['VERIFIED','PARTIAL','INVALID'].includes(m.status)&&reason(m.reason)&&integer(m.endTick,RUN_TICKS)&&integer(m.nearMisses)&&integer(m.coins)&&Array.isArray(m.qualifiedTiers)&&m.qualifiedTiers.every((n:unknown)=>integer(n,4));
    case 'error':return text(m.code)&&typeof m.message==='string';
    default:return false;
  }
}
class NetworkRunner extends LocalRunner {
  constructor(params:SimParams,private update:()=>void){super(params);}
  override advance(_ms:number){this.update();}
  drive(ms:number){super.advance(ms);}
}
export class PlayClient {
  readonly params:SimParams;
  readonly runner:NetworkRunner;
  status:Status='idle';error:string|null=null;result:RunResult|null=null;
  readonly verified=new Map<number,Extract<PlayS2C,{t:'nearMiss.verified'}>>();
  readonly recorded=new Map<number,Extract<PlayS2C,{t:'nearMiss.recorded'}>>();
  /** Tiers whose on-chain Qualified event arrived (run.qualified). The Garage reads /me for the authoritative state. */
  readonly qualified=new Map<number,Extract<PlayS2C,{t:'run.qualified'}>>();
  private socket:SocketPort|null=null;private generation=0;private stopped=false;
  private offset=0;private pingAt:number|null=null;private bestRtt=Infinity;private connectedAt=0;
  private advancing=false;
  private startAt:number|null=null;private lastClock=0;private lastPublish=-Infinity;private lastPing=-Infinity;
  private offlineAt:number|null=null;private readySent=false;private endSent=false;private specSeq=0;
  private outbox:PlayC2S[]=[];private acks=new Map<string,{fingerprint:string;applied:boolean;generation:number}>();
  /** Kunci acak per halaman (di memori saja). Server mengikat pengendali run ke kunci ini pada run.ready pertama. */
  readonly clientKey=Array.from(crypto.getRandomValues(new Uint8Array(18)),b=>b.toString(16).padStart(2,'0')).join('');
  constructor(params:SimParams,private url:string,private now=()=>performance.timeOrigin+performance.now(),private factory:(url:string)=>SocketPort=url=>new WebSocket(url)){
    this.params={...params};this.runner=new NetworkRunner(this.params,()=>this.update());
  }
  get pendingCount(){return this.outbox.length;}
  async connect(getToken:()=>Promise<string|null>){
    if(this.stopped||this.status==='expired'||this.status==='result'||this.status==='error'||this.socket?.readyState===0||this.socket?.readyState===1)return;
    if(this.expireOffline())return;
    const generation=++this.generation;this.status='connecting';this.error=null;
    try{
      const token=await getToken();if(this.stopped||generation!==this.generation||this.expireOffline())return;
      if(!token)throw new Error();
      const endpoint=new URL(this.url);if(!['ws:','wss:'].includes(endpoint.protocol))throw new Error();endpoint.searchParams.set('token',token);endpoint.searchParams.set('client',this.clientKey);
      const socket=this.factory(endpoint.href);this.socket=socket;this.connectedAt=this.now();
      const active=()=>!this.stopped&&generation===this.generation&&this.socket===socket;
      socket.addEventListener('open',()=>{if(!active()||this.expireOffline())return;this.offlineAt=null;this.lastPublish=-Infinity;this.status=this.startAt===null?'syncing':this.runner.phase==='ended'?'waiting_result':this.runner.phase==='countdown'?'countdown':'running';this.flush();if(this.startAt===null){this.readySent=false;this.ping();}});
      socket.addEventListener('message',event=>{if(active())this.receive(event.data);});
      socket.addEventListener('close',()=>{if(!active()||['error','result','expired'].includes(this.status))return;this.socket=null;this.offlineAt??=this.now();this.status='disconnected';});
      socket.addEventListener('error',()=>{if(active())this.error='Game connection interrupted. The result is not yet confirmed.';});
    }catch{if(!this.stopped&&generation===this.generation)this.fail('Game session or connection could not be set up yet.');}
  }
  private ping(){this.pingAt=Math.floor(this.now());this.lastPing=this.now();this.send({t:'ping',clientMs:this.pingAt});}
  private send(message:PlayC2S,critical=false){
    if(this.stopped||['error','expired','result'].includes(this.status))return;
    if(this.socket?.readyState===1&&this.outbox.length===0){try{this.socket.send(JSON.stringify(message));return;}catch{/* Keep the critical message in order for a reconnect. */}}
    if(critical){if(this.outbox.length>=4096){this.fail('Connection buffer full. The run result needs checking.');return;}this.outbox.push(message);}
  }
  private flush(){while(this.outbox.length&&this.socket?.readyState===1){try{this.socket.send(JSON.stringify(this.outbox[0]));this.outbox.shift();}catch{break;}}}
  private fail(message:string){this.error=message;this.status='error';this.generation++;this.socket?.close();this.socket=null;}
  private receive(raw:unknown){
    let m:PlayS2C;try{if(typeof raw!=='string'||raw.length>65536)throw new Error();const parsed=JSON.parse(raw);if(!valid(parsed))throw new Error();m=parsed;}catch{if(!this.result)this.fail('Game message did not match the protocol. Run stopped.');return;}
    if(this.result&&m.t!=='nearMiss.recorded'&&m.t!=='run.qualified'&&!(m.t==='error'&&m.code==='RECORD_FAILED'))return;
    if(m.t==='pong'){
      if(m.clientMs!==this.pingAt)return;
      const rtt=this.now()-m.clientMs;if(rtt<0||rtt>10000)return;
      if(this.startAt===null&&rtt<this.bestRtt){this.bestRtt=rtt;this.offset=m.serverMs-(m.clientMs+rtt/2);}
      this.pingAt=null;
      if(!this.readySent&&this.startAt===null){this.readySent=true;this.status='ready';this.send({t:'run.ready',runId:this.params.runId});}
    }else if(m.t==='run.go'){
      if(this.startAt!==null)return;
      if(!this.readySent){this.fail('Start time received before the connection was ready.');return;}
      if(m.seed!==undefined){
        if(!this.runner.setSeedBeforeStart(m.seed)){this.fail('Run seed received after the game had started.');return;}
        this.params.seed=m.seed;
      }
      this.startAt=m.startAt;const serverNow=this.now()+this.offset;
      this.runner.start();this.runner.countdownMs=Math.max(0,m.startAt-serverNow);this.lastClock=serverNow;
      this.drive(Math.max(0,serverNow-m.startAt));this.updateStatus();
    }else if(m.t==='disruption.scheduled')this.disrupt(m);
    else if(m.t==='nearMiss.verified')this.verified.set(m.index,m);
    else if(m.t==='nearMiss.recorded')this.recorded.set(m.index,m);
    else if(m.t==='run.qualified')this.qualified.set(m.tier,m);
    else if(m.t==='run.result'){this.result=m;this.status='result';this.outbox=[];}
    else if(m.t==='error'){
      if(m.code==='RECORD_FAILED')this.error='Chain recording failed. The game continues; check the run result.';
      else this.fail(m.code==='UNAUTHORIZED'?'Session ended. Sign in again.':m.code==='NOT_CONTROLLER'?'This run is being played in another tab or device. Continue there, or check the result once it finishes.':'Server could not continue this run yet.');
    }
  }
  private disrupt(m:DisruptionScheduled){
    const fingerprint=JSON.stringify(m);const prior=this.acks.get(m.id);
    if(prior){
      if(prior.fingerprint!==fingerprint)this.fail('Duplicate disruption has different data.');
      else if(prior.generation!==this.generation){prior.generation=this.generation;this.send({t:'disruption.ack',id:m.id,applied:prior.applied},true);}
      return;
    }
    this.update();const applied=this.startAt!==null&&this.runner.phase!=='ended'&&this.runner.current.tick<m.warnTick;
    this.acks.set(m.id,{fingerprint,applied,generation:this.generation});
    if(applied){const kind=m.kind==='NITRO'?EntryKind.SPEC_NITRO:m.kind==='SPIKES'?EntryKind.SPEC_SPIKES:EntryKind.SPEC_RED;
      const data=m.kind==='NITRO'?0:m.kind==='SPIKES'?m.lanes[0]:encodeRedData(m.lanes[0],m.durationIndex!);
      this.runner.schedule({tick:m.warnTick,kind,data,seq:++this.specSeq});}
    this.send({t:'disruption.ack',id:m.id,applied},true);
  }
  private updateStatus(){if(this.status==='disconnected'||this.status==='connecting')return;this.status=this.runner.phase==='ended'?'waiting_result':this.runner.phase==='countdown'?'countdown':'running';}
  private drive(ms:number){
    this.advancing=true;
    try{this.runner.drive(ms);}finally{this.advancing=false;}
  }
  private update(){
    // A GO listener can send input while drive() is still before tick 1. Do not step recursively.
    if(this.advancing||this.startAt===null||this.stopped||['error','expired','result'].includes(this.status))return;
    const clock=this.now()+this.offset;const delta=Math.max(0,clock-this.lastClock);this.lastClock=Math.max(this.lastClock,clock);
    this.drive(delta);this.updateStatus();
  }
  input(kind:PlayerInputKind){
    if(this.expireOffline())return;
    this.update();if(this.stopped||['error','expired','result'].includes(this.status)||!isPlayerInputKind(kind))return;
    const entry=this.runner.input(kind);if(entry)this.send({t:'input',tick:entry.tick,kind,seq:entry.seq},true);
  }
  pump(){
    if(this.stopped||['error','expired','result'].includes(this.status))return;
    if(this.expireOffline())return;
    if(this.startAt===null){if(this.socket?.readyState===1&&this.now()-this.connectedAt>10000){this.fail('Server did not provide a start time. Check the active run before trying again.');return;}if(this.socket?.readyState===1&&this.now()-this.lastPing>=2000)this.ping();return;}
    this.update();this.flush();
    const finishing=this.runner.phase==='ended'&&!this.endSent;
    if(finishing||this.now()-this.lastPublish>=NET.watermarkEveryMs){this.lastPublish=this.now();const view=this.runner.current;this.send({t:'watermark',tick:view.tick},finishing);this.send({t:'snapshot',tick:view.tick,x:view.player.x,z:view.player.z,speed:view.player.speed,targetLane:view.player.targetLane,nearMisses:view.nearMisses});}
    if(this.runner.phase==='ended'&&!this.endSent){this.endSent=true;const view=this.runner.current;this.send({t:'run.end',tick:view.tick,reason:view.endReason!,nearMisses:view.nearMisses,inputHash:this.runner.sim.inputHash},true);}
  }
  private expireOffline(){if(!this.stopped&&this.offlineAt!==null&&this.now()-this.offlineAt>NET.offlineGraceMs){this.status='expired';this.error='Disconnected too long. Check the run result before creating a new run.';this.outbox=[];this.generation++;const socket=this.socket;this.socket=null;socket?.close();return true;}return false;}
  dispose(){this.stopped=true;this.generation++;this.outbox=[];this.socket?.close();this.socket=null;this.status='closed';}
}
