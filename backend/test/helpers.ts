import { createSiweMessage } from 'viem/siwe';
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, toHex } from 'viem';
import { buildApp } from '../src/app';
import { MockChain } from '../src/chain/mock';
import { openDb } from '../src/db/client';
import { loadEnv, type Env } from '../src/env';

export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-test-secret-test-secret-123',
  PUBLIC_ORIGIN: 'http://localhost:5173',
  CHAIN_ID: '10143',
  DATABASE_URL: ':memory:',
};

/** Jam yang bisa dimajukan manual. */
export function fakeClock(start = 1_760_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms), set: (v: number) => void (t = v) };
}

export async function makeTestApp(envOverrides: Record<string, string> = {}) {
  const env: Env = loadEnv({ ...TEST_ENV, ...envOverrides });
  const clock = fakeClock();
  const { db, close } = openDb(':memory:');
  const chain = new MockChain({ chainId: env.CHAIN_ID, now: clock.now, intervalMs: 0 });
  const { app, ctx } = await buildApp({ env, db, chain, now: clock.now });
  await app.ready(); // wajib sebelum app.injectWS
  return { app, ctx, db, chain, clock, env, close: async () => { await app.close(); close(); } };
}

export const testAccount = (label: string) => privateKeyToAccount(keccak256(toHex(label)));

type TestApp = Awaited<ReturnType<typeof makeTestApp>>;

/** Login SIWE penuh, kembalikan token JWT. */
export async function login(t: TestApp, label = 'player-1', opts: { domain?: string; chainId?: number } = {}) {
  const account = testAccount(label);
  const nonceRes = await t.app.inject({ method: 'POST', url: '/auth/nonce', payload: { address: account.address } });
  const { nonce } = nonceRes.json();
  const message = createSiweMessage({
    address: account.address,
    chainId: opts.chainId ?? t.env.CHAIN_ID,
    domain: opts.domain ?? 'localhost:5173',
    nonce,
    uri: 'http://localhost:5173',
    version: '1',
    issuedAt: new Date(t.clock.now()),
  });
  const signature = await account.signMessage({ message });
  const res = await t.app.inject({ method: 'POST', url: '/auth/verify', payload: { message, signature } });
  return { res, account, message, signature, token: res.statusCode === 200 ? (res.json().token as string) : '' };
}
