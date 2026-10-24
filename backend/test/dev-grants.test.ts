// DEV_GRANT_TIERS: kepemilikan khusus pengembangan lewat jalur backend asli (/me + cek kepemilikan POST /runs).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { applyDevGrants, parseDevGrants } from '../src/devGrants';
import { loadEnv } from '../src/env';
import { ownedCars } from '../src/db/schema';
import { balance } from '../src/services/ledger';
import { TEST_ENV, login, makeTestApp } from './helpers';
import { createRun } from './play';

let t: Awaited<ReturnType<typeof makeTestApp>>;
beforeEach(async () => { t = await makeTestApp(); });
afterEach(async () => { await t.close(); });

describe('DEV_GRANT_TIERS', () => {
  it('hanya diterima untuk chain mock di luar production', () => {
    const grant = { DEV_GRANT_TIERS: '0x1111111111111111111111111111111111111111:1' };
    expect(loadEnv({ ...TEST_ENV, ...grant }).DEV_GRANT_TIERS).toBe(grant.DEV_GRANT_TIERS);
    expect(() => loadEnv({ ...TEST_ENV, ...grant, NODE_ENV: 'production', PRIVY_APP_ID: 'x', PRIVY_VERIFICATION_KEY: 'k', PRIVY_APP_SECRET: 's' })).toThrow(/DEV_GRANT_TIERS/);
    expect(() => loadEnv({
      ...TEST_ENV, ...grant, CHAIN_MODE: 'live', MONAD_RPC_URL: 'https://rpc.test', MONAD_WS_URL: 'wss://rpc.test',
      ATTESTER_PRIVATE_KEY: `0x${'1'.repeat(64)}`, VOUCHER_SIGNER_PRIVATE_KEY: `0x${'2'.repeat(64)}`,
      RUN_REGISTRY_ADDRESS: `0x${'3'.repeat(40)}`, CAR_NFT_ADDRESS: `0x${'4'.repeat(40)}`,
    })).toThrow(/DEV_GRANT_TIERS/);
  });

  it('menolak alamat/tier tidak valid; Starter tidak bisa di-grant', () => {
    expect(() => parseDevGrants('bukan-alamat:1')).toThrow();
    expect(() => parseDevGrants('0x1111111111111111111111111111111111111111:9')).toThrow();
    expect(() => parseDevGrants('0x1111111111111111111111111111111111111111:0')).toThrow();
    expect(parseDevGrants('')).toEqual([]);
  });

  it('akun A memiliki Tier 1 di /me dan bisa membuat run Tier 1; akun B tidak; saldo tidak berubah', async () => {
    const a = await login(t, 'a');
    const b = await login(t, 'b');
    applyDevGrants(t.db, t.chain, parseDevGrants(`${a.account.address.toLowerCase()}:1`));
    const me = (await t.app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${a.token}` } })).json();
    expect(me.ownedTiers).toEqual([1]);
    expect(me.qualifiedTiers).toEqual([]);
    expect(balance(t.db, a.account.address)).toBe(0);
    expect((await createRun(t, a.token, { carTier: 1 })).statusCode).toBe(200);
    expect((await createRun(t, b.token, { carTier: 1 })).statusCode).toBe(403);
    // Idempoten: start ulang tidak menggandakan baris.
    applyDevGrants(t.db, t.chain, parseDevGrants(`${a.account.address}:1`));
    expect(t.db.select().from(ownedCars).where(eq(ownedCars.address, a.account.address)).all()).toHaveLength(1);
  });
});
