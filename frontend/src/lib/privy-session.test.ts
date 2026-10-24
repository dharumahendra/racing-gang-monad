import { it, expect } from 'vitest';
import { createPrivySession } from './privy-session';
const address = '0x1111111111111111111111111111111111111111';
const who = { subject:'did:privy:one', address };
const profile = { address, coins:0, coinsPending:0, coinsReserved:0, ownedTiers:[0], qualifiedTiers:[] } as const;
const account = { ...profile, ownedTiers:[0], qualifiedTiers:[] };
it('never treats a Google session as a backend-authenticated profile when backend is absent', async () => {
  const s = createPrivySession(null); await s.connect(who, async ()=>'privy-token');
  expect(s.getState().status).toBe('waiting_backend'); expect(s.getState().account).toBeNull();
});
it('rejects a backend profile for a different wallet', async () => {
  const s = createPrivySession(async()=>({...account,address:'0x2222222222222222222222222222222222222222'}));
  await s.connect(who, async()=>'privy-token'); expect(s.getState().status).toBe('error'); expect(s.getState().account).toBeNull();
});
it('discards a late profile after logout', async () => {
  let finish!: (value: typeof account)=>void;
  const s = createPrivySession(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=s.connect(who,async()=>'token'); await new Promise(resolve=>setTimeout(resolve,0));
  s.reset(); finish(account); await pending;
  expect(s.getState().status).toBe('signed_out'); expect(s.getState().account).toBeNull();
});
it('gets a refreshed Privy token instead of reusing expired bearer credentials', async () => {
  const seen: string[]=[]; let token='first';
  const s=createPrivySession(async value=>{seen.push(value); return account;});
  await s.connect(who,async()=>token); token='refreshed'; await s.refresh();
  expect(seen).toEqual(['first','refreshed']); expect(s.getState().status).toBe('ready');
});
it('invalidates account A when Privy subject changes even if address is unchanged', async () => {
  let finish!: (value: typeof account)=>void;
  const s=createPrivySession(()=>new Promise(resolve=>{finish=resolve;}));
  const old=s.connect(who,async()=>'a-token'); await new Promise(resolve=>setTimeout(resolve,0));
  const releaseOld=finish;
  const next=s.connect({subject:'did:privy:two',address},async()=>'b-token'); await new Promise(resolve=>setTimeout(resolve,0));
  releaseOld(account); await old; expect(s.getState().status).toBe('connecting');
  finish(account); await next; expect(s.getState().status).toBe('ready');
});
