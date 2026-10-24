import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONFIG_VERSION } from '@racing-gang/config';
import { loadEnv } from '../src/env';
import { nearMisses, ownedCars, qualifications, reservations, runs } from '../src/db/schema';
import { addLedgerEntry, balance } from '../src/services/ledger';
import { TEST_ENV, login, makeTestApp } from './helpers';

let t: Awaited<ReturnType<typeof makeTestApp>>;
beforeEach(async () => { t = await makeTestApp(); });
afterEach(async () => { await t.close(); });

describe('env', () => {
  it('CHAIN_MODE=live tanpa RPC dan kunci ditolak dengan pesan jelas', () => {
    expect(() => loadEnv({ ...TEST_ENV, CHAIN_MODE: 'live' })).toThrow(/MONAD_RPC_URL/);
  });

  it('JWT_SECRET pendek ditolak; nilai kosong dianggap tidak diisi', () => {
    expect(() => loadEnv({ ...TEST_ENV, JWT_SECRET: 'pendek' })).toThrow(/JWT_SECRET/);
    expect(loadEnv({ ...TEST_ENV, MONAD_RPC_URL: '' }).MONAD_RPC_URL).toBeUndefined();
  });
});

describe('endpoint dasar', () => {
  it('/health', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/health' });
    expect(res.json()).toEqual({ ok: true, chainMode: 'mock', relayerQueue: 0, activeRuns: 0 });
  });

  it('/config berisi konstanta game, CARS dengan priceWei, dan kontrak null sebelum deploy', async () => {
    const body = (await t.app.inject({ method: 'GET', url: '/config' })).json();
    expect(body.configVersion).toBe(CONFIG_VERSION);
    expect(body.chainId).toBe(10143);
    expect(body.contracts).toBeNull();
    expect(body.constants.RUN_TICKS).toBe(3000);
    expect(body.constants.CARS[1].priceWei).toBe('50000000000000000');
    expect(body.constants.laneCenter).toBeUndefined();
  });

  it('endpoint tidak dikenal → 404 dengan format error seragam', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/tidak-ada' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan' } });
  });
});

describe('GET /leaderboard', () => {
  it('urut mepet terbanyak, tanpa run INVALID atau yang belum selesai, dengan limit', async () => {
    const now = t.clock.now();
    const row = (i: number, n: number, result: 'VERIFIED' | 'PARTIAL' | 'INVALID' | null) => ({
      id: `0x${i.toString(16).padStart(64, '0')}`, address: '0x1111111111111111111111111111111111111111', carTier: 0, seed: '0x',
      seedBlock: 1, configVersion: 1, lifecycle: result ? ('ENDED' as const) : ('RUNNING' as const), result,
      chainStatus: 'PENDING' as const, nearMisses: n, createdAt: now, endedAt: result ? now + i : null,
    });
    t.db.insert(runs).values([row(1, 40, 'VERIFIED'), row(2, 90, 'INVALID'), row(3, 75, 'PARTIAL'), row(4, 99, null), row(5, 40, 'VERIFIED')]).run();
    const body = (await t.app.inject({ method: 'GET', url: '/leaderboard?limit=2' })).json();
    expect(body.entries.map((e: { nearMisses: number; endedAt: number }) => [e.nearMisses, e.endedAt])).toEqual([[75, now + 3], [40, now + 1]]);
    expect((await t.app.inject({ method: 'GET', url: '/leaderboard?limit=0' })).statusCode).toBe(400);
  });
});

describe('ledger dan /me', () => {
  it('ref ledger idempoten', () => {
    const a = '0x1111111111111111111111111111111111111111' as const;
    expect(addLedgerEntry(t.db, a, 100, 'run:1', 0)).toBe(true);
    expect(addLedgerEntry(t.db, a, 100, 'run:1', 0)).toBe(false);
    expect(balance(t.db, a)).toBe(100);
  });

  it('/me menghitung koin, pending, reserved, tier, dan run terbaik', async () => {
    const { token, account } = await login(t);
    const addr = account.address;
    const now = t.clock.now();
    addLedgerEntry(t.db, addr, 100, 'r1:1', now);
    addLedgerEntry(t.db, addr, 200, 'r1:2', now);
    addLedgerEntry(t.db, addr, -100, 'voucher:9', now);
    t.db.insert(reservations).values([
      { nonce: '1', address: addr, tier: 1, coinCost: 3000, expiresAt: now + 1, status: 'ACTIVE', createdAt: now },
      { nonce: '2', address: addr, tier: 2, coinCost: 9999, expiresAt: now + 1, status: 'RELEASED', createdAt: now },
    ]).run();
    const run = (id: string, n: number, result: 'VERIFIED' | 'INVALID' | null) => ({
      id, address: addr, carTier: 0, seed: '0x', seedBlock: 1, configVersion: 1, lifecycle: 'ENDED' as const,
      result, chainStatus: 'PENDING' as const, nearMisses: n, createdAt: now,
    });
    t.db.insert(runs).values([run('0xa', 12, 'VERIFIED'), run('0xb', 50, 'INVALID'), run('0xc', 3, null)]).run();
    const nm = (runId: string, idx: number, coins: number, recordedAt: number | null) => ({
      runId, idx, tick: idx, vehicleId: idx, vehicleType: coins === 200 ? 1 : 0, coins, inputHash: '0x', verifiedAt: now, recordedAt,
    });
    t.db.insert(nearMisses).values([nm('0xa', 1, 100, now), nm('0xa', 2, 200, null), nm('0xb', 1, 100, null), nm('0xc', 1, 100, null)]).run();
    t.db.insert(qualifications).values({ address: addr, tier: 1, runId: '0xa', txHash: '0x', blockNumber: 1 }).run();
    t.db.insert(ownedCars).values({ address: addr, tier: 1, tokenId: '1', runId: '0xa', txHash: '0x' }).run();

    const me = (await t.app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } })).json();
    expect(me).toEqual({
      address: addr,
      coins: 200,
      coinsPending: 300,          // 200 dari run 0xa + 100 dari run 0xc; run INVALID tidak dihitung
      coinsReserved: 3000,        // hanya reservasi ACTIVE
      ownedTiers: [1],
      qualifiedTiers: [1],
      bestRun: { runId: '0xa', nearMisses: 12 },   // run INVALID tidak dihitung
    });
  });
});
