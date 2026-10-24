import { describe, expect, it } from 'vitest';
import { createSession, type Account, type AuthApi } from './session';
const a = '0x1111111111111111111111111111111111111111';
const b = '0x2222222222222222222222222222222222222222';
const account: Account = { address: a, coins: 4000, coinsReserved: 3000, coinsPending: 200, ownedTiers: [0], qualifiedTiers: [1] };
function setup(overrides: Partial<AuthApi> = {}) {
  const api: AuthApi = { nonce: async () => 'nonce1234', verify: async () => 'test-token', me: async () => account, ...overrides };
  const session = createSession(api, 10143); session.setIdentity({ address: a, chainId: 10143 }); return session;
}
describe('wallet-bound SIWE session', () => {
  it('only authenticates after verify and matching /me complete', async () => {
    const s = setup(); await s.login(n => `SIWE ${n}`, async () => 'signature');
    expect(s.getState().status).toBe('authenticated'); expect(s.getState().account?.address).toBe(a);
  });
  it('rejects login on a different chain before asking for a signature', async () => {
    const s = setup(); s.setIdentity({ address: a, chainId: 1 }); let signed = false;
    await s.login(n => n, async () => { signed = true; return 'sig'; });
    expect(signed).toBe(false); expect(s.getState().error).toMatch(/network/i);
  });
  it('clears account and token on account switch', async () => {
    const s = setup(); await s.login(n => n, async () => 'sig'); expect(s.getState().account?.address).toBe(a); s.setIdentity({ address: b, chainId: 10143 });
    expect(s.getState().status).toBe('anonymous'); expect(s.getState().token).toBeNull(); expect(s.getState().account).toBeNull();
  });
  it('discards a late verify response after switching accounts', async () => {
    let release!: (v: string) => void;
    const s = setup({ verify: () => new Promise(resolve => { release = resolve; }) });
    const pending = s.login(n => n, async () => 'sig');
    await new Promise(resolve => setTimeout(resolve, 0));
    s.setIdentity({ address: b, chainId: 10143 }); release('old-token'); await pending;
    expect(s.getState().token).toBeNull(); expect(s.getState().account).toBeNull(); expect(s.getState().status).toBe('anonymous');
  });
  it('discards late profile responses after logout', async () => {
    let release!: (v: Account) => void;
    const s = setup({ me: () => new Promise(resolve => { release = resolve; }) });
    const pending = s.login(n => n, async () => 'sig'); await new Promise(resolve => setTimeout(resolve, 0));
    s.logout(); release(account); await pending;
    expect(s.getState().token).toBeNull(); expect(s.getState().status).toBe('anonymous');
  });
  it('does not accept a profile belonging to another wallet', async () => {
    const s = setup({ me: async () => ({ ...account, address: b }) }); await s.login(n => n, async () => 'sig');
    expect(s.getState().status).toBe('error'); expect(s.getState().token).toBeNull();
  });
  it('keeps a rejected signature unauthenticated with actionable feedback', async () => {
    const s = setup(); await s.login(n => n, async () => { throw { code: 4001 }; });
    expect(s.getState().status).toBe('error'); expect(s.getState().error).toMatch(/canceled/i); expect(s.getState().token).toBeNull();
  });
  it('clears expired tokens when profile refresh fails', async () => {
    let expired = false;
    const s = setup({ me: async () => { if (expired) throw new Error('Session expired. Sign in again.'); return account; } });
    await s.login(n => n, async () => 'sig'); expired = true; await s.refresh();
    expect(s.getState().token).toBeNull(); expect(s.getState().account).toBeNull(); expect(s.getState().error).toMatch(/Sign in again/);
  });
});
