import { CARS, CONFIG_VERSION } from '@racing-gang/config';
import type { CreateRunRequest, CreateRunResponse } from '@racing-gang/config/protocol';
import { ApiError } from './api';
export function createRunApi(baseUrl:string,fetcher:typeof fetch=fetch) {
  return {async create(input:CreateRunRequest,token:string,signal?:AbortSignal):Promise<CreateRunResponse> {
    if(!baseUrl||!token)throw new ApiError('Masuk dan siapkan koneksi game terlebih dahulu.','NOT_CONFIGURED');
    if(!Number.isInteger(input.carTier)||!CARS[input.carTier]||(input.roomCode!==undefined&&!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(input.roomCode)))throw new ApiError('Mobil atau kode room tidak valid.','BAD_REQUEST');
    let response:Response;
    try{response=await fetcher(`${baseUrl.replace(/\/$/,'')}/runs`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({carTier:input.carTier,...(input.roomCode?{roomCode:input.roomCode}:{})}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});}
    catch{throw new ApiError('Status pembuatan run belum diketahui. Jangan membuat ulang sebelum memeriksa run aktif.','UNKNOWN_OUTCOME');}
    const body=await response.json().catch(()=>null);
    if(response.status>=500)throw new ApiError('Status pembuatan run belum diketahui. Periksa run aktif sebelum mencoba lagi.','UNKNOWN_OUTCOME');
    if(!response.ok)throw new ApiError(response.status===401?'Sesi berakhir. Masuk lagi.':response.status===404?'Layanan run belum tersedia.':response.status===409?'Masih ada run aktif atau pilihan belum tersedia.':'Run belum dapat dibuat.',body?.error?.code||(response.status===401?'UNAUTHORIZED':'API_ERROR'));
    const hex=(s:unknown)=>typeof s==='string'&&/^0x[\da-f]{64}$/i.test(s);
    if(!body||!hex(body.runId)||!hex(body.seed)||!Number.isSafeInteger(body.seedBlock)||body.seedBlock<0||body.configVersion!==CONFIG_VERSION)throw new ApiError('Respons run belum cocok dengan konfigurasi game ini.','INVALID_RESPONSE');
    return body as CreateRunResponse;
  }};
}
