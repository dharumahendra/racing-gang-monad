import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { recoverTypedDataAddress, zeroAddress } from 'viem';
import { CARS, CHAIN } from '@racing-gang/config';
import type { Address, Hex, VoucherResponse } from '@racing-gang/config/protocol';
import { voucherDomain, voucherTypes } from '../src/chain/voucherTypes';
import { reservations } from '../src/db/schema';
import { addLedgerEntry } from '../src/services/ledger';
import { RELEASE_MARGIN_MS, releaseExpiredReservations } from '../src/services/vouchers';
import { login, makeTestApp } from './helpers';
import { playToEnd, startPlayer, tick } from './play';

let t: Awaited<ReturnType<typeof makeTestApp>>;
let token: string;
let buyer: Address;

beforeEach(async () => {
  t = await makeTestApp();
  const l = await login(t);
  token = l.token;
  buyer = l.account.address;
});
afterEach(async () => { await t.close(); });

const RUN = `0x${'aa'.repeat(32)}` as Hex;
const qualify = (tier = 1) => t.chain.qualified.set(`${buyer}:${tier}`, RUN);
const giveCoins = (n: number, ref = 'seed') => addLedgerEntry(t.db, buyer, n, ref, t.clock.now());
const request = (tier: number) =>
  t.app.inject({ method: 'POST', url: '/vouchers', headers: { authorization: `Bearer ${token}` }, payload: { tier } });
const me = async () => (await t.app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } })).json();
const toMessage = (v: VoucherResponse['voucher']) => ({ ...v, nonce: BigInt(v.nonce), expiry: BigInt(v.expiry) });

describe('POST /vouchers', () => {
  it('menolak tier tidak valid, belum lulus, dan koin kurang', async () => {
    expect((await request(0)).json().error.code).toBe('BAD_REQUEST');
    expect((await request(5)).json().error.code).toBe('BAD_REQUEST');
    expect((await request(1)).json().error.code).toBe('NOT_QUALIFIED');
    qualify();
    giveCoins(CARS[1].coinCost - 1);
    const res = await request(1);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INSUFFICIENT_COINS');
  });

  it('voucher valid EIP-712 (domain RacingGangCars), koin disisihkan, double-click dapat voucher yang sama', async () => {
    qualify();
    giveCoins(5000);
    const res = await request(1);
    expect(res.statusCode).toBe(200);
    const v = res.json() as VoucherResponse;
    expect(v.voucher).toMatchObject({ buyer, tier: 1, coinCost: CARS[1].coinCost, expiry: Math.floor(t.clock.now() / 1000) + CHAIN.voucherTtlSec });
    expect(v.expiresAt).toBe(v.voucher.expiry * 1000);
    const signer = await recoverTypedDataAddress({
      domain: voucherDomain(t.env.CHAIN_ID, zeroAddress), types: voucherTypes, primaryType: 'Voucher', message: toMessage(v.voucher), signature: v.signature,
    });
    expect(signer).toBe(t.chain.voucher.address);
    expect(await me()).toMatchObject({ coins: 5000, coinsReserved: CARS[1].coinCost });

    const again = (await request(1)).json() as VoucherResponse;
    expect(again.voucher.nonce).toBe(v.voucher.nonce);
    expect(t.db.select().from(reservations).all()).toHaveLength(1);
  });

  it('pembelian: koin dipotong tepat sekali walau event terbaca dua kali; lalu ALREADY_OWNED', async () => {
    qualify();
    giveCoins(5000);
    const v = (await request(1)).json() as VoucherResponse;
    await t.chain.simulatePurchase(buyer, toMessage(v.voucher));
    const purchased = { type: 'Purchased' as const, buyer, tier: 1, tokenId: 10_001n, voucherNonce: BigInt(v.voucher.nonce), coinCost: CARS[1].coinCost, runId: RUN, txHash: '0x01' as Hex, blockNumber: 1n };
    await t.chain.bus.emit(purchased); // replay dari backfill
    expect(await me()).toMatchObject({ coins: 5000 - CARS[1].coinCost, coinsReserved: 0, ownedTiers: [1] });
    expect(t.db.select().from(reservations).where(eq(reservations.nonce, v.voucher.nonce)).get()?.status).toBe('CONSUMED');
    expect((await request(1)).json().error.code).toBe('ALREADY_OWNED');
  });

  it('voucher kedaluwarsa → reservasi dilepas → voucher baru dengan nonce berbeda', async () => {
    qualify();
    giveCoins(CARS[1].coinCost);
    const first = (await request(1)).json() as VoucherResponse;
    t.clock.advance(CHAIN.voucherTtlSec * 1000 + RELEASE_MARGIN_MS + 1);
    expect(releaseExpiredReservations(t.db, t.clock.now())).toBe(1);
    expect((await me()).coinsReserved).toBe(0);
    const second = (await request(1)).json() as VoucherResponse;
    expect(second.voucher.nonce).not.toBe(first.voucher.nonce);
  });

  it('voucher baru langsung bisa diminta begitu yang lama kedaluwarsa (tanpa menunggu job pelepasan)', async () => {
    qualify();
    giveCoins(CARS[1].coinCost); // cukup untuk satu reservasi saja
    const first = (await request(1)).json() as VoucherResponse;
    t.clock.advance(CHAIN.voucherTtlSec * 1000 + 1);
    const res = await request(1);
    expect(res.statusCode).toBe(200);
    expect((res.json() as VoucherResponse).voucher.nonce).not.toBe(first.voucher.nonce);
    expect((await me()).coinsReserved).toBe(CARS[1].coinCost);
    expect(t.db.select().from(reservations).where(eq(reservations.nonce, first.voucher.nonce)).get()?.status).toBe('RELEASED');
  });

  it('event Purchased untuk reservasi yang sudah dilepas tetap memotong koin (chain adalah kebenaran)', async () => {
    qualify();
    giveCoins(CARS[1].coinCost);
    const v = (await request(1)).json() as VoucherResponse;
    t.clock.advance(CHAIN.voucherTtlSec * 1000 + RELEASE_MARGIN_MS + 1);
    releaseExpiredReservations(t.db, t.clock.now());
    await t.chain.simulatePurchase(buyer, toMessage(v.voucher));
    expect(await me()).toMatchObject({ coins: 0, coinsReserved: 0, ownedTiers: [1] });
  });

  it('alur Definition of Done (mock chain): main → lulus Tier 1 → voucher → beli → mobil dimiliki', async () => {
    let p: Awaited<ReturnType<typeof startPlayer>> | undefined;
    for (let attempt = 0; attempt < 8 && !p?.client.qualified.length; attempt++) {
      p = await startPlayer(t, 'player-1');
      await playToEnd(t, p);
      while (t.chain.relayer.queueSize() > 0) await t.chain.flush();
      await tick();
    }
    expect(p!.client.qualified[0]?.tier).toBe(1);
    token = p!.token;
    const before = await me();
    expect(before.qualifiedTiers).toContain(1);
    expect(before.coins).toBeGreaterThanOrEqual(CARS[1].coinCost);

    const v = (await request(1)).json() as VoucherResponse;
    await t.chain.simulatePurchase(buyer, toMessage(v.voucher));
    const after = await me();
    expect(after).toMatchObject({ coins: before.coins - CARS[1].coinCost, coinsReserved: 0, ownedTiers: [1] });
    // Tier 1 sekarang bisa dipakai untuk run berikutnya.
    const res = await t.app.inject({ method: 'POST', url: '/runs', headers: { authorization: `Bearer ${token}` }, payload: { carTier: 1 } });
    expect(res.statusCode).toBe(200);
  });

  it('suplai habis → SOLD_OUT; chain mati → CHAIN_UNAVAILABLE', async () => {
    qualify(4);
    giveCoins(100_000);
    t.chain.mintedByTier.set(4, BigInt(CARS[4].supply));
    expect((await request(4)).json().error.code).toBe('SOLD_OUT');
    t.chain.reads.isQualified = async () => { throw new Error('RPC timeout'); };
    const res = await request(1);
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('CHAIN_UNAVAILABLE');
  });
});
