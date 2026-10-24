import { it, expect } from 'vitest';
import { createPrivySession } from './privy-session';
import type { Account } from './session';
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

// Regresi: ganti akun Google (logout akun A lalu login akun B) tidak boleh menampilkan akun A,
// walau respons /me akun A baru datang belakangan. Meniru urutan Bridge: reset() -> connect(B).
it('ignores a late account-A profile after logging out and signing in as account B', async () => {
  const addressB = '0x2222222222222222222222222222222222222222';
  const accountA: Account = { ...account };
  const accountB: Account = { ...account, address: addressB, coins: 999 };
  let finishA!: (value: Account) => void;
  const profiles: Record<string, Account> = {
    'a-token': accountA,
    'b-token': accountB,
  };
  const s = createPrivySession((token) =>
    token === 'a-token' ? new Promise<Account>((resolve) => { finishA = resolve; }) : Promise.resolve(profiles[token]!),
  );
  // Login akun A: /me-nya menggantung.
  const pendingA = s.connect(who, async () => 'a-token');
  await new Promise((r) => setTimeout(r, 0));
  expect(s.getState().status).toBe('connecting');
  // Logout lalu login akun B (urutan Bridge pada perubahan identitas Privy).
  s.reset();
  await s.connect({ subject: 'did:privy:two', address: addressB }, async () => 'b-token');
  expect(s.getState().status).toBe('ready');
  expect(s.getState().account?.address).toBe(addressB);
  // Respons akun A yang terlambat harus diabaikan sepenuhnya.
  finishA(accountA); await pendingA;
  expect(s.getState().status).toBe('ready');
  expect(s.getState().account?.address).toBe(addressB);
  expect(s.getState().account?.coins).toBe(999);
});
