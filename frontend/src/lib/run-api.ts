import { CARS, CONFIG_VERSION } from '@racing-gang/config';
import type { ActiveRunResponse, CreateRunRequest, CreateRunResponse } from '@racing-gang/config/protocol';
import { ApiError } from './api';
export function createRunApi(baseUrl:string,fetcher:typeof fetch=fetch) {
  return {async create(input:CreateRunRequest,token:string,signal?:AbortSignal):Promise<CreateRunResponse> {
    if(!baseUrl||!token)throw new ApiError('Sign in and set up the game connection first.','NOT_CONFIGURED');
    if(!Number.isInteger(input.carTier)||!CARS[input.carTier]||(input.roomCode!==undefined&&!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(input.roomCode)))throw new ApiError('Invalid car or room code.','BAD_REQUEST');
    let response:Response;
    try{response=await fetcher(`${baseUrl.replace(/\/$/,'')}/runs`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({carTier:input.carTier,...(input.roomCode?{roomCode:input.roomCode}:{})}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});}
    catch{throw new ApiError('Run creation status is unknown. Do not retry before checking for an active run.','UNKNOWN_OUTCOME');}
    const body=await response.json().catch(()=>null);
    if(response.status>=500)throw new ApiError('Run creation status is unknown. Check for an active run before trying again.','UNKNOWN_OUTCOME');
    if(!response.ok)throw new ApiError(response.status===401?'Session expired. Sign in again.':response.status===404?'Run service is not available yet.':response.status===409?'There is still an active run, or the selection is unavailable.':'Could not create the run.',body?.error?.code||(response.status===401?'UNAUTHORIZED':'API_ERROR'));
    const hex=(s:unknown)=>typeof s==='string'&&/^0x[\da-f]{64}$/i.test(s);
    if(!body||!hex(body.runId)||!hex(body.seed)||!Number.isSafeInteger(body.seedBlock)||body.seedBlock<0||body.configVersion!==CONFIG_VERSION)throw new ApiError('Run response does not match this game configuration.','INVALID_RESPONSE');
    return body as CreateRunResponse;
  },
  /** GET /runs/active: run aktif akun ini (identitas dari token). Aman diulang; tidak membuat run. */
  async active(token:string,signal?:AbortSignal):Promise<ActiveRunResponse> {
    if(!baseUrl||!token)throw new ApiError('Sign in and set up the game connection first.','NOT_CONFIGURED');
    let response:Response;
    try{response=await fetcher(`${baseUrl.replace(/\/$/,'')}/runs/active`,{headers:{Authorization:`Bearer ${token}`},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});}
    catch{throw new ApiError('Could not check the active run. Try again.','NETWORK');}
    const body=await response.json().catch(()=>null);
    if(response.status===401)throw new ApiError('Session expired. Sign in again.','UNAUTHORIZED');
    if(!response.ok||!body||typeof body.creating!=='boolean')throw new ApiError('Could not check the active run. Try again.','API_ERROR');
    const r=body.run;
    if(r===null)return {run:null,creating:body.creating};
    const hex=(s:unknown)=>typeof s==='string'&&/^0x[\da-f]{64}$/i.test(s);
    if(!r||!hex(r.runId)||!hex(r.seed)||!Number.isSafeInteger(r.seedBlock)||r.configVersion!==CONFIG_VERSION||!CARS[r.carTier]||typeof r.controlled!=='boolean'||!['CREATED','READY','RUNNING'].includes(r.lifecycle))
      throw new ApiError('Active run response does not match this game configuration.','INVALID_RESPONSE');
    return {run:r,creating:false};
  }};
}
