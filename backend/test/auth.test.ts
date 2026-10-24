import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSiweMessage } from 'viem/siwe';
import { NONCE_TTL_MS } from '../src/auth/nonceStore';
import { login, makeTestApp, testAccount } from './helpers';

let t: Awaited<ReturnType<typeof makeTestApp>>;
beforeEach(async () => { t = await makeTestApp(); });
afterEach(async () => { await t.close(); });

describe('SIWE login', () => {
  it('nonce → tanda tangan → JWT → /me', async () => {
    const { res, token, account } = await login(t);
    expect(res.statusCode).toBe(200);
    const me = await t.app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({
      address: account.address,
      coins: 0, coinsPending: 0, coinsReserved: 0,
      ownedTiers: [], qualifiedTiers: [], bestRun: null,
    });
  });

  it('nonce hanya sekali pakai', async () => {
    const first = await login(t);
    const replay = await t.app.inject({ method: 'POST', url: '/auth/verify', payload: { message: first.message, signature: first.signature } });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('UNAUTHORIZED');
  });

  it('domain salah ditolak', async () => {
    const { res } = await login(t, 'player-1', { domain: 'evil.example' });
    expect(res.statusCode).toBe(401);
  });

  it('chain ID salah ditolak', async () => {
    const { res } = await login(t, 'player-1', { chainId: 1 });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toContain('Chain ID');
  });

  it('nonce kedaluwarsa setelah 5 menit', async () => {
    const account = testAccount('late');
    const { nonce } = (await t.app.inject({ method: 'POST', url: '/auth/nonce', payload: { address: account.address } })).json();
    const message = createSiweMessage({ address: account.address, chainId: t.env.CHAIN_ID, domain: 'localhost:5173', nonce, uri: 'http://localhost:5173', version: '1' });
    const signature = await account.signMessage({ message });
    t.clock.advance(NONCE_TTL_MS + 1);
    const res = await t.app.inject({ method: 'POST', url: '/auth/verify', payload: { message, signature } });
    expect(res.statusCode).toBe(401);
  });

  it('tanda tangan dari wallet lain ditolak', async () => {
    const account = testAccount('victim');
    const attacker = testAccount('attacker');
    const { nonce } = (await t.app.inject({ method: 'POST', url: '/auth/nonce', payload: { address: account.address } })).json();
    const message = createSiweMessage({ address: account.address, chainId: t.env.CHAIN_ID, domain: 'localhost:5173', nonce, uri: 'http://localhost:5173', version: '1' });
    const signature = await attacker.signMessage({ message });
    const res = await t.app.inject({ method: 'POST', url: '/auth/verify', payload: { message, signature } });
    expect(res.statusCode).toBe(401);
  });

  it('body tidak valid → 400 BAD_REQUEST', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/auth/nonce', payload: { address: 'bukan-alamat' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
  });

  it('/me tanpa token atau dengan token palsu → 401', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401);
    const bad = await t.app.inject({ method: 'GET', url: '/me', headers: { authorization: 'Bearer abc.def.ghi' } });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error.code).toBe('UNAUTHORIZED');
  });
});
