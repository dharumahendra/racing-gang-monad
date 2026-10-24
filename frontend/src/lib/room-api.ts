import { CARS, ROOM, SPECTATOR } from '@racing-gang/config';
import type { CreateRoomResponse, RoomResponse, RoomRunInfo } from '@racing-gang/config/protocol';
import { ApiError } from './api';
export const normalizeRoomCode=(value:string)=>value.toUpperCase().replace(/\s/g,'');
export const validRoomCode=(value:unknown):value is string=>typeof value==='string'&&value.length===ROOM.codeLength&&[...value].every(c=>ROOM.alphabet.includes(c));
export const uint=(n:unknown,max=Number.MAX_SAFE_INTEGER):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=max;
export const hex32=(value:unknown):value is `0x${string}`=>typeof value==='string'&&/^0x[\da-f]{64}$/i.test(value);
export function validRun(value:any):value is RoomRunInfo{return value&&hex32(value.runId)&&hex32(value.seed)&&uint(value.carTier,CARS.length-1)&&(value.startAt===null||uint(value.startAt));}
export function validRoom(value:any,code:string):value is RoomResponse{return value&&value.code===code&&uint(value.expiresAt)&&uint(value.spectators,SPECTATOR.maxPerRoom)&&(value.run===null||validRun(value.run));}
export function createRoomApi(baseUrl:string,fetcher:typeof fetch=fetch){
  const endpoint=baseUrl.replace(/\/$/,'');
  return {
    async create(token:string,signal?:AbortSignal):Promise<CreateRoomResponse>{
      if(!endpoint||!token)throw new ApiError('Sign in and set up the room service first.','NOT_CONFIGURED');
      let response:Response;
      try{response=await fetcher(`${endpoint}/rooms`,{method:'POST',headers:{Authorization:`Bearer ${token}`},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});}catch{throw new ApiError('Room creation status is unknown. Check for an active room before retrying.','UNKNOWN_OUTCOME');}
      const body=await response.json().catch(()=>null);
      if(response.status>=500)throw new ApiError('Room creation status is unknown. Check for an active room before retrying.','UNKNOWN_OUTCOME');
      if(!response.ok)throw new ApiError(response.status===401?'Session expired. Sign in again.':'Could not create the room.',body?.error?.code||(response.status===401?'UNAUTHORIZED':'API_ERROR'));
      if(!body||!validRoomCode(body.code)||!uint(body.expiresAt))throw new ApiError('Room creation response does not match. Check for an active room before retrying.','INVALID_RESPONSE');
      return {code:body.code,expiresAt:body.expiresAt};
    },
    async read(code:string,signal?:AbortSignal):Promise<RoomResponse>{
      if(!validRoomCode(code))throw new ApiError('Invalid room code.','BAD_REQUEST');if(!endpoint)throw new ApiError('Room service is not configured.','NOT_CONFIGURED');
      let response:Response;try{response=await fetcher(`${endpoint}/rooms/${code}`,{headers:{Accept:'application/json'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});}catch{throw new ApiError('Could not read the room. Check your connection.','NETWORK');}
      const body=await response.json().catch(()=>null);
      if(!response.ok)throw new ApiError(response.status===404?'Room not found.':response.status===410?'Room has expired.':'Could not update the room status.',body?.error?.code||'API_ERROR');
      if(!validRoom(body,code))throw new ApiError('Room response does not match the protocol.','INVALID_RESPONSE');return body;
    },
  };
}
export class RoomMonitor{
  room:RoomResponse|null=null;status:'loading'|'ready'|'error'|'closed'='loading';error:string|null=null;lastUpdated:number|null=null;
  private busy=false;private generation=0;private request:AbortController|null=null;private closed=false;
  constructor(readonly code:string,private api:Pick<ReturnType<typeof createRoomApi>,'read'>,private now=()=>Date.now()){}
  get expired(){return this.room!==null&&this.room.expiresAt<=this.now();}
  get canStart(){return this.status==='ready'&&!this.expired&&this.room?.run===null;}
  async poll(){
    if(this.closed||this.busy)return;this.busy=true;const generation=this.generation;this.request=new AbortController();
    try{const room=await this.api.read(this.code,this.request.signal);if(this.closed||generation!==this.generation)return;this.room=room;this.status='ready';this.error=null;this.lastUpdated=this.now();}
    catch(error){if(!this.closed&&generation===this.generation){this.status='error';this.error=error instanceof Error?error.message:'Room status is not available yet.';}}
    finally{if(generation===this.generation){this.busy=false;this.request=null;}}
  }
  dispose(){this.closed=true;this.generation++;this.request?.abort();this.request=null;this.busy=false;this.status='closed';}
}
