import { CARS, RUN_TICKS, VEHICLE } from '@racing-gang/config';
import type { NearMissInfo, RunSummaryResponse } from '@racing-gang/config/protocol';
import { ApiError } from './api';
import { hex32, uint, validRoomCode } from './room-api';
const address=(s:unknown):s is string=>typeof s==='string'&&/^0x[\da-f]{40}$/i.test(s);
function validRow(row:any,total:number,endTick:number|null):row is NearMissInfo{
  return row&&uint(row.index,total)&&row.index>0&&uint(row.tick,endTick??RUN_TICKS)&&[0,1].includes(row.vehicleType)&&row.coins===(row.vehicleType===0?VEHICLE.CAR.coins:VEHICLE.TRUCK.coins)&&hex32(row.inputHash)&&((row.txHash===null&&row.blockNumber===null)||(hex32(row.txHash)&&uint(row.blockNumber)));
}
function valid(body:any,id:string):body is RunSummaryResponse{
  if(!body||body.runId!==id||!address(body.player)||!hex32(body.seed)||!uint(body.seedBlock)||!uint(body.configVersion)||body.configVersion<1||!uint(body.carTier,CARS.length-1)||(body.roomCode!==null&&!validRoomCode(body.roomCode)))return false;
  if(!['CREATED','READY','RUNNING','ENDED'].includes(body.lifecycle)||!['VERIFIED','PARTIAL','INVALID',null].includes(body.result)||!['PENDING','RECORDED','RECORD_FAILED'].includes(body.chainStatus)||!['CRASH','RED_ZONE_FAIL','TIME_UP','TIMEOUT',null].includes(body.endReason))return false;
  if((body.endTick!==null&&!uint(body.endTick,RUN_TICKS))||!uint(body.nearMisses,RUN_TICKS)||(body.startAt!==null&&!uint(body.startAt))||!uint(body.createdAt))return false;
  if((body.endReason===null)!==(body.endTick===null)||body.lifecycle!=='ENDED'&&(body.result!==null||body.endReason!==null))return false;
  return Array.isArray(body.nearMissList)&&body.nearMissList.length<=body.nearMisses&&body.nearMissList.every((row:unknown)=>validRow(row,body.nearMisses,body.endTick))&&new Set(body.nearMissList.map((row:NearMissInfo)=>row.index)).size===body.nearMissList.length;
}
export function createSummaryApi(baseUrl:string,fetcher:typeof fetch=fetch){
  return {async read(id:string,signal?:AbortSignal):Promise<RunSummaryResponse>{
    if(!hex32(id))throw new ApiError('ID run tidak valid.','BAD_REQUEST');if(!baseUrl)throw new ApiError('Layanan hasil belum dikonfigurasi.','NOT_CONFIGURED');
    let response:Response;try{response=await fetcher(`${baseUrl.replace(/\/$/,'')}/runs/${id}`,{headers:{Accept:'application/json'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});}catch{throw new ApiError('Status run belum dapat diperbarui. Periksa koneksi.','NETWORK');}
    if(!response.ok)throw new ApiError(response.status===404?'Run tidak ditemukan atau layanan hasil belum tersedia.':'Server belum dapat memberikan status run.',response.status===404?'NOT_FOUND':'API_ERROR');
    const body=await response.json().catch(()=>null);if(!valid(body,id))throw new ApiError('Respons hasil belum cocok dengan protokol.','INVALID_RESPONSE');return body;
  }};
}
export function summaryStats(summary:RunSummaryResponse){const recorded=summary.nearMissList.filter(row=>row.txHash!==null).length;return {recorded,pending:Math.max(0,summary.nearMisses-recorded),listedCoins:summary.nearMissList.reduce((sum,row)=>sum+row.coins,0)};}
export class RunSummaryMonitor{
  summary:RunSummaryResponse|null=null;status:'loading'|'ready'|'error'|'closed'='loading';error:string|null=null;lastUpdated:number|null=null;
  private busy=false;private closed=false;private generation=0;private request:AbortController|null=null;
  constructor(readonly id:string,private api:Pick<ReturnType<typeof createSummaryApi>,'read'>,private now=()=>Date.now()){}
  async poll(){if(this.closed||this.busy)return;this.busy=true;const generation=this.generation;this.request=new AbortController();
    try{const next=await this.api.read(this.id,this.request.signal);if(this.closed||generation!==this.generation)return;const old=this.summary;if(old&&(old.player!==next.player||old.seed!==next.seed||old.carTier!==next.carTier||old.configVersion!==next.configVersion||old.seedBlock!==next.seedBlock||old.createdAt!==next.createdAt||old.lifecycle==='ENDED'&&next.lifecycle!=='ENDED'))throw new ApiError('Status run berubah tidak konsisten. Data terakhir dipertahankan.','INVALID_RESPONSE');this.summary=next;this.status='ready';this.error=null;this.lastUpdated=this.now();}
    catch(error){if(!this.closed&&generation===this.generation){this.error=error instanceof Error?error.message:'Hasil belum tersedia.';this.status='error';}}
    finally{if(generation===this.generation){this.busy=false;this.request=null;}}
  }
  dispose(){this.closed=true;this.generation++;this.request?.abort();this.request=null;this.busy=false;this.status='closed';}
}
