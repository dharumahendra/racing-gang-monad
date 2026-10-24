import { afterEach, expect, it, vi } from 'vitest';
import { CONFIG_VERSION } from '@racing-gang/config';
import { auditRun } from '@racing-gang/sim';
const rpc = vi.hoisted(() => ({ getChainId:vi.fn(),readContract:vi.fn(),getBlockNumber:vi.fn(),getLogs:vi.fn() }));
vi.mock('viem', async original => ({...await original<typeof import('viem')>(),createPublicClient:()=>rpc}));
import { loadPublicAudit } from './public-audit';
const id=('0x'+'1'.repeat(64)) as `0x${string}`;
const seed=('0x'+'2'.repeat(64)) as `0x${string}`;
const player='0x1111111111111111111111111111111111111111';
const log={runId:id,seed,seedBlock:10,player,carTier:0,configVersion:CONFIG_VERSION,entries:[]};
const hash=auditRun(log,{nearMisses:[],end:{endTick:0,totalNearMisses:0}}).replayFinalHash;
function setup(complete=true) {
  rpc.getChainId.mockResolvedValue(10143);rpc.getBlockNumber.mockResolvedValue(12n);
  rpc.readContract.mockResolvedValue({player,carTier:0,configVersion:CONFIG_VERSION,seed,ended:true,nearMisses:0});
  rpc.getLogs.mockImplementation(async ({event})=> !complete ? [] : event.name==='RunStarted' ? [{args:{seed}}] : event.name==='RunEnded' ? [{args:{endTick:0,totalNearMisses:0,finalInputHash:hash}}] : []);
  vi.stubGlobal('fetch', vi.fn(async (url:string)=>new Response(JSON.stringify(url.endsWith('/log')?log:{...log,lifecycle:'ENDED',endTick:0,nearMisses:0,finalHash:hash,nearMissList:[]}))));
}
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('compares actual shared replay with contract run and start/end records',async()=>{
 setup(); const data=await loadPublicAudit(id,'http://test','http://rpc',new AbortController().signal);
 expect(data.verdict).toBe('match');expect(data.backendResult.ok).toBe(true);expect(rpc.getLogs).toHaveBeenCalledTimes(3);
});
it('does not turn empty event responses into a successful audit',async()=>{
 setup(false);expect((await loadPublicAudit(id,'http://test','http://rpc',new AbortController().signal)).verdict).toBe('incomplete');
});
it('rejects the wrong RPC chain before reading contract evidence',async()=>{
 setup();rpc.getChainId.mockResolvedValue(1);
 await expect(loadPublicAudit(id,'http://test','http://rpc',new AbortController().signal)).rejects.toThrow('RPC chain');
 expect(rpc.readContract).not.toHaveBeenCalled();
});
it('reports a contract identity mismatch even when replay counts match',async()=>{
 setup();rpc.readContract.mockResolvedValue({player:'0x2222222222222222222222222222222222222222',carTier:0,configVersion:CONFIG_VERSION,seed,ended:true,nearMisses:0});
 expect((await loadPublicAudit(id,'http://test','http://rpc',new AbortController().signal)).verdict).toBe('mismatch');
});
