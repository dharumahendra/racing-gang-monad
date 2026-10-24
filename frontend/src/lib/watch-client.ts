import { disruptionCost, LANES, LANE_WIDTH, RUN_TICKS, SPECTATOR, type DisruptionKind, type DurationIndex } from '@racing-gang/config';
import type { DisruptionScheduled, NearMissRecorded, PlayerSnapshot, RoomResponse, RunResult, WatchC2S, WatchS2C } from '@racing-gang/config/protocol';
import type { SocketPort } from './play-client';
import { hex32, uint, validRoom, validRoomCode } from './room-api';
const finite=(n:unknown,max=Number.MAX_SAFE_INTEGER):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max;
const text=(s:unknown):s is string=>typeof s==='string'&&s.length>0&&s.length<=500;
const duration=(d:unknown):d is DurationIndex=>uint(d,2);
function valid(m:any,code:string):m is WatchS2C{
  if(!m||typeof m!=='object')return false;
  switch(m.t){
    case 'room.state':return validRoom(m,code);
    case 'energy':return finite(m.value,SPECTATOR.energyMax);
    case 'run.snapshot':return uint(m.tick,RUN_TICKS)&&uint(m.x,LANES*LANE_WIDTH)&&uint(m.z)&&uint(m.speed)&&uint(m.targetLane,LANES-1)&&uint(m.nearMisses);
    case 'disrupt.accepted':return text(m.id);
    case 'disrupt.rejected':return ['ENERGY','LIMIT','NO_RUN','RATE','ROOM_EXPIRED'].includes(m.reason);
    case 'disruption.scheduled':return text(m.id)&&typeof m.by==='string'&&m.by.length<=100&&uint(m.warnTick,RUN_TICKS)&&Array.isArray(m.lanes)&&m.lanes.every((l:unknown)=>uint(l,LANES-1))&&(m.kind==='NITRO'?m.lanes.length===0:m.kind==='SPIKES'?m.lanes.length===1:m.kind==='RED'&&duration(m.durationIndex)&&(m.lanes.length===1||m.lanes.length===2&&m.lanes[1]===m.lanes[0]+1));
    case 'nearMiss.recorded':return uint(m.index)&&m.index>0&&hex32(m.txHash)&&uint(m.blockNumber)&&finite(m.latencyMs);
    case 'run.result':return ['VERIFIED','PARTIAL','INVALID'].includes(m.status)&&['CRASH','RED_ZONE_FAIL','TIME_UP','TIMEOUT'].includes(m.reason)&&uint(m.endTick,RUN_TICKS)&&uint(m.nearMisses)&&uint(m.coins)&&Array.isArray(m.qualifiedTiers)&&m.qualifiedTiers.every((tier:unknown)=>uint(tier,4));
    case 'error':return text(m.code)&&typeof m.message==='string';
    default:return false;
  }
}
export class WatchClient{
  status:'idle'|'connecting'|'joining'|'ready'|'disconnected'|'uncertain'|'changed'|'expired'|'full'|'error'|'closed'='idle';
  room:RoomResponse|null=null;energy:number|null=null;snapshot:PlayerSnapshot|null=null;result:RunResult|null=null;feedback:string|null=null;error:string|null=null;
  readonly scheduled=new Map<string,DisruptionScheduled>();readonly recorded=new Map<number,NearMissRecorded>();
  private socket:SocketPort|null=null;private generation=0;private disposed=false;private joinedAt=0;private boundRun:string|null=null;private needsEnergy=false;private lastSent=-Infinity;private pending:{at:number;runId:string}|null=null;private serverExpired=false;
  constructor(private baseUrl:string,readonly code:string,private nick='',private now=()=>Date.now(),private factory:(url:string)=>SocketPort=url=>new WebSocket(url)){}
  get expired(){return this.serverExpired||this.room!==null&&this.room.expiresAt<=this.now();}
  get pendingAction(){return this.pending!==null;}
  connect(){
    if(this.disposed||this.socket?.readyState===0||this.socket?.readyState===1)return;
    const generation=++this.generation;this.energy=null;this.room=null;this.snapshot=null;this.result=null;this.boundRun=null;this.recorded.clear();this.scheduled.clear();this.pending=null;this.needsEnergy=false;this.serverExpired=false;this.error=null;this.feedback=generation>1?'Waiting for the latest room state.':null;this.status='connecting';this.joinedAt=this.now();
    try{if(!validRoomCode(this.code))throw new Error();const endpoint=new URL(`${this.baseUrl.replace(/\/$/,'')}/ws/watch`);if(!['ws:','wss:'].includes(endpoint.protocol))throw new Error();endpoint.searchParams.set('room',this.code);const nick=this.nick.trim().slice(0,16);if(nick)endpoint.searchParams.set('nick',nick);const socket=this.factory(endpoint.href);this.socket=socket;
      const active=()=>!this.disposed&&generation===this.generation&&this.socket===socket;
      socket.addEventListener('open',()=>{if(active())this.status='joining';});
      socket.addEventListener('message',event=>{if(active())this.receive(event.data);});
      socket.addEventListener('close',()=>{if(!active())return;if(this.pending)this.feedback='The last submission status is unknown. It will not be resent.';this.pending=null;this.energy=null;this.socket=null;this.status='disconnected';});
      socket.addEventListener('error',()=>{if(active())this.error='Spectator connection interrupted.';});
    }catch{this.stop('error','Spectator connection could not be set up yet.');}
  }
  private stop(status:WatchClient['status'],message:string){this.generation++;this.pending=null;this.energy=null;this.status=status;this.error=message;const socket=this.socket;this.socket=null;socket?.close();}
  private ready(){if(this.room&&this.energy!==null)this.status='ready';}
  private receive(raw:unknown){
    let m:WatchS2C;try{if(typeof raw!=='string'||raw.length>65536)throw new Error();const body=JSON.parse(raw);if(!valid(body,this.code))throw new Error();m=body;}catch{this.stop('error','Spectator message did not match the protocol.');return;}
    if(m.t==='room.state'){
      const next=m.run?.runId;if(next&&this.boundRun&&next!==this.boundRun){this.room=m;this.snapshot=null;this.result=null;this.recorded.clear();this.scheduled.clear();this.stop('changed','A new run is available. Reconnect to follow it.');return;}
      if(next)this.boundRun=next;if(!m.run&&this.pending){this.feedback='The run changed before the submission status was confirmed. It will not be resent.';this.pending=null;}
      this.room=m;this.ready();
    }else if(m.t==='energy'){this.energy=m.value;this.needsEnergy=false;this.ready();}
    else if(m.t==='error'){
      if(m.code==='ROOM_EXPIRED'){this.serverExpired=true;const unknown=this.pending!==null;this.pending=null;this.feedback=`Room expired. New disruptions are disabled; an active run can still be watched.${unknown?' The last submission status is unknown. It will not be resent.':''}`;if(!this.room?.run)this.stop('expired','Room has expired.');}
      else if(m.code==='ROOM_FULL')this.stop('full','Room full. Try again after a spectator leaves.');
      else if(m.code==='RECORD_FAILED')this.error='Chain recording is delayed or failed. This does not confirm a balance.';
      else this.stop('error',m.code==='ROOM_NOT_FOUND'?'Room not found.':'Server could not open this room yet.');
    }else if(!this.boundRun)return;
    else if(m.t==='run.snapshot'){if(!this.result&&(!this.snapshot||m.tick>=this.snapshot.tick))this.snapshot=m;}
    else if(m.t==='disruption.scheduled'){if(!this.result&&!this.scheduled.has(m.id))this.scheduled.set(m.id,m);}
    else if(m.t==='nearMiss.recorded')this.recorded.set(m.index,m);
    else if(m.t==='run.result'){if(!this.result){this.result=m;this.pending=null;this.feedback='Run finished. Gameplay result and chain recording are checked separately.';}}
    else if(m.t==='disrupt.accepted'){
      if(this.pending&&this.pending.runId===this.room?.run?.runId){this.pending=null;this.feedback='Received by server. Application to the player is not yet confirmed.';}
    }else if(m.t==='disrupt.rejected'&&this.pending){
      this.pending=null;const labels={ENERGY:'Not enough energy. Waiting for the latest value from the server.',LIMIT:'The disruption limit is currently reached. Try after a pause.',NO_RUN:'No run is in progress yet.',RATE:'Too fast. Pause before the next submission.',ROOM_EXPIRED:'Room expired. New disruptions are disabled.'};this.feedback=labels[m.reason];this.needsEnergy=m.reason==='ENERGY';if(m.reason==='ENERGY')this.energy=null;if(m.reason==='ROOM_EXPIRED')this.serverExpired=true;if(m.reason==='NO_RUN'&&this.room)this.room={...this.room,run:null};
    }
  }
  canSend(kind:DisruptionKind,durationIndex:DurationIndex=0){
    if(!['NITRO','SPIKES','RED'].includes(kind)||!duration(durationIndex))return false;
    return this.status==='ready'&&this.socket?.readyState===1&&!this.expired&&!this.result&&!this.pending&&!this.needsEnergy&&this.now()-this.lastSent>=1000/SPECTATOR.maxMsgPerSec&&this.energy!==null&&this.energy>=disruptionCost(kind,durationIndex)&&this.room?.run?.startAt!==null&&this.room?.run?.startAt!==undefined&&this.room.run.startAt<=this.now();
  }
  send(action:Omit<WatchC2S,'t'>){
    if((action.kind==='SPIKES'||action.kind==='RED')&&!uint(action.lane,LANES-1)||action.kind==='RED'&&!duration(action.durationIndex)||!this.canSend(action.kind,action.durationIndex))return false;
    const message:WatchC2S=action.kind==='NITRO'?{t:'disrupt',kind:'NITRO'}:action.kind==='SPIKES'?{t:'disrupt',kind:'SPIKES',lane:action.lane}:{t:'disrupt',kind:'RED',lane:action.lane,durationIndex:action.durationIndex};
    this.pending={at:this.now(),runId:this.room!.run!.runId};this.lastSent=this.now();this.needsEnergy=true;this.feedback='Sending disruption…';
    try{this.socket!.send(JSON.stringify(message));return true;}catch{this.feedback='Submission status is unknown. It will not be resent.';this.stop('uncertain','Reconnect to refresh the room state.');return false;}
  }
  pump(){if(this.disposed)return;if(['connecting','joining'].includes(this.status)&&this.now()-this.joinedAt>10000)this.stop('error','Room did not provide the latest state. Try reconnecting.');else if(this.pending&&this.now()-this.pending.at>5000){this.feedback='Submission status is unknown. It will not be resent.';if(this.expired&&this.room?.run)this.pending=null;else this.stop('uncertain','Reconnect to refresh energy and room state.');}}
  dispose(){this.disposed=true;this.stop('closed','Spectator connection closed.');}
}
