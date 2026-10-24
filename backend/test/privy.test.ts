import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SignJWT, exportSPKI, generateKeyPair, type CryptoKey } from 'jose';
import type { PlayC2S } from '@racing-gang/config/protocol';
import { PlayerClient } from '../scripts/lib/playerClient';
import { loadEnv } from '../src/env';
import { TEST_ENV, makeTestApp } from './helpers';
import { connect, playToEnd, waitFor } from './play';

const APP_ID = 'test-privy-app';
const DID = 'did:privy:alice';
const EMBEDDED = '0x1111111111111111111111111111111111111111';

let privateKey: CryptoKey;
let publicPem: string;
let otherKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256', { extractable: true });
  privateKey = pair.privateKey;
  publicPem = await exportSPKI(pair.publicKey);
  otherKey = (await generateKeyPair('ES256')).privateKey;
});

type PrivyUser = { linked_accounts: object[] };
let users: Record<string, PrivyUser>;
let calls: { url: string; headers: Record<string, string> }[];
let failWith: number | 'network' | null;

const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, headers: init?.headers as Record<string, string> });
  if (failWith === 'network') throw new Error('ECONNRESET');
  if (failWith) return new Response('{}', { status: failWith });
  const did = decodeURIComponent(url.split('/v1/users/')[1] ?? '');
  const user = users[did];
  return user ? Response.json({ id: did, ...user }) : new Response('{}', { status: 404 });
}) as typeof fetch;

let t: Awaited<ReturnType<typeof makeTestApp>>;
beforeEach(async () => {
  users = {
    [DID]: {
      linked_accounts: [
        { type: 'google_oauth', email: 'alice@example.com' },
        { type: 'wallet', address: '0x2222222222222222222222222222222222222222', chain_type: 'ethereum', connector_type: 'injected', wallet_client_type: 'metamask' },
        { type: 'wallet', address: 'So1anaAddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', chain_type: 'solana', connector_type: 'embedded', wallet_client_type: 'privy' },
        { type: 'wallet', address: EMBEDDED.toLowerCase(), chain_type: 'ethereum', connector_type: 'embedded', wallet_client_type: 'privy', wallet_index: 0 },
      ],
    },
  };
  calls = [];
  failWith = null;
  t = await makeTestApp(
    { ALLOW_SIWE_LOGIN: 'false', PRIVY_APP_ID: APP_ID, PRIVY_VERIFICATION_KEY: publicPem, PRIVY_APP_SECRET: 'rahasia' },
    { fetch: fakeFetch },
  );
});
afterEach(async () => { await t.close(); });

async function token(p: { sub?: string; aud?: string; iss?: string; expIn?: number; key?: CryptoKey } = {}) {
  const now = Math.floor(t.clock.now() / 1000);
  return new SignJWT({ sid: 'session-1' })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuer(p.iss ?? 'privy.io')
    .setAudience(p.aud ?? APP_ID)
    .setSubject(p.sub ?? DID)
    .setIssuedAt(now)
    .setExpirationTime(now + (p.expIn ?? 3600))
    .sign(p.key ?? privateKey);
}

const me = (tok: string) => t.app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${tok}` } });

describe('login Privy + Google', () => {
  it('token valid → akun = embedded wallet Ethereum dari server Privy; berikutnya tanpa memanggil Privy', async () => {
    const res = await me(await token());
    expect(res.statusCode).toBe(200);
    expect(res.json().address).toBe(EMBEDDED);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`https://api.privy.io/v1/users/${encodeURIComponent(DID)}`);
    expect(calls[0]!.headers['privy-app-id']).toBe(APP_ID);
    expect(calls[0]!.headers.authorization).toBe(`Basic ${Buffer.from(`${APP_ID}:rahasia`).toString('base64')}`);

    users[DID]!.linked_accounts = [{ type: 'wallet', address: '0x3333333333333333333333333333333333333333', chain_type: 'ethereum', connector_type: 'embedded' }];
    expect((await me(await token())).json().address).toBe(EMBEDDED); // ikatan tidak ditimpa
    expect(calls).toHaveLength(1);
  });

  it('token ditolak tanpa memanggil Privy: audience, issuer, kedaluwarsa, kunci asing, bukan DID', async () => {
    for (const bad of [
      await token({ aud: 'app-lain' }),
      await token({ iss: 'evil.io' }),
      await token({ expIn: -10 }),
      await token({ key: otherKey }),
      await token({ sub: 'user-123' }),
      'bukan.jwt.sama-sekali',
    ]) {
      const res = await me(bad);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    }
    expect((await t.app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('SIWE dimatikan: endpoint /auth/* tidak ada dan JWT HS256 ditolak', async () => {
    expect((await t.app.inject({ method: 'POST', url: '/auth/nonce', payload: { address: EMBEDDED } })).statusCode).toBe(404);
    const hs = t.app.jwt.sign({ sub: EMBEDDED });
    expect((await me(hs)).statusCode).toBe(401);
  });

  it('embedded wallet belum dibuat → 409 WALLET_NOT_READY', async () => {
    users[DID]!.linked_accounts = [{ type: 'google_oauth', email: 'alice@example.com' }];
    const res = await me(await token());
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('WALLET_NOT_READY');
  });

  it('server Privy bermasalah → 503 AUTH_PROVIDER_UNAVAILABLE; akun yang sudah terikat tetap bisa masuk', async () => {
    failWith = 500;
    expect((await me(await token())).json().error.code).toBe('AUTH_PROVIDER_UNAVAILABLE');
    failWith = 'network';
    expect((await me(await token())).statusCode).toBe(503);
    failWith = null;
    expect((await me(await token())).statusCode).toBe(200);
    failWith = 500;
    expect((await me(await token())).statusCode).toBe(200);
  });

  it('dua akun Privy berbeda tidak bisa mengklaim wallet yang sama', async () => {
    expect((await me(await token())).statusCode).toBe(200);
    users['did:privy:mallory'] = users[DID]!;
    const res = await me(await token({ sub: 'did:privy:mallory' }));
    expect(res.statusCode).toBe(401);
  });

  it('run penuh lewat REST + WS memakai token Privy', async () => {
    const tok = await token();
    const created = await t.app.inject({ method: 'POST', url: '/runs', headers: { authorization: `Bearer ${tok}` }, payload: { carTier: 0 } });
    expect(created.statusCode).toBe(200);
    const run = created.json();
    let ws: Awaited<ReturnType<typeof connect>> | null = null;
    const client = new PlayerClient({ runId: run.runId, seed: run.seed, carTier: 0, send: (m: PlayC2S) => ws?.send(JSON.stringify(m)) });
    ws = await connect(t, tok, (m) => client.handle(m));
    await playToEnd(t, { client } as Parameters<typeof playToEnd>[1]);
    expect(client.result?.status).toBe('VERIFIED');
    expect(client.verified).toHaveLength(client.localNearMisses.length);
  });

  it('WS dengan token tidak valid → error lalu ditutup 4401', async () => {
    let closeCode = 0;
    void t.app.injectWS(`/ws/play?token=${await token({ aud: 'app-lain' })}`, {}, { onInit: (s) => s.on('close', (c) => { closeCode = c; }) }).catch(() => {});
    await waitFor(() => closeCode !== 0, 'close', 20_000);
    expect(closeCode).toBe(4401);
  });
});

describe('env login', () => {
  const base = { ...TEST_ENV, ALLOW_SIWE_LOGIN: 'false' };
  it('production wajib Privy; konfigurasi Privy harus lengkap; harus ada minimal satu metode login', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', ALLOW_SIWE_LOGIN: 'true' })).toThrow(/PRIVY_APP_ID/);
    expect(() => loadEnv({ ...base, PRIVY_APP_ID: 'x' })).toThrow(/PRIVY_APP_SECRET/);
    expect(() => loadEnv(base)).toThrow(/tidak ada metode login/);
    expect(loadEnv({ ...base, PRIVY_APP_ID: 'x', PRIVY_VERIFICATION_KEY: 'k', PRIVY_APP_SECRET: 's' }).ALLOW_SIWE_LOGIN).toBe(false);
  });
});
