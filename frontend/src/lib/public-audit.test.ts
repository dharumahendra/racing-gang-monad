import { expect, it } from 'vitest';
import { getDeployment } from '@racing-gang/config';
import { carNftAbiProblems } from './purchase';
import { auditVerdict, validateAuditLog } from './public-audit';
import type { AuditResult } from '@racing-gang/sim';
it('accepts the actual deployed purchase ABI', () => {
  expect(getDeployment()?.chainId).toBe(10143);
  expect(carNftAbiProblems(getDeployment()!.abi.CarNFT)).toEqual([]);
});
it('never calls missing start/end evidence a match', () => {
  const result = { ok:true } as AuditResult;
  expect(auditVerdict(result, {nearMisses:[]})).toBe('incomplete');
  expect(auditVerdict({...result,ok:false}, {nearMisses:[]})).toBe('mismatch');
  const hash = ('0x'+'1'.repeat(64)) as `0x${string}`;
  expect(auditVerdict(result, {seed:hash,nearMisses:[],end:{endTick:0,totalNearMisses:0,finalInputHash:hash}})).toBe('match');
});
it('rejects mismatched or unsupported public logs before replay', () => {
  expect(()=>validateAuditLog({} as never, 'bad')).toThrow();
});
