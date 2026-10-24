// Voucher pembelian mobil (TECH_SPEC §5.5, §6.3, BACKEND_PLAN J).
// Cek di sini hanya untuk UX; yang menegakkan tetap CarNFT.buy(). Koin baru dipotong saat event Purchased terbaca.
import { randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { CARS, CHAIN, MAX_TIER } from '@racing-gang/config';
import type { Address, VoucherResponse } from '@racing-gang/config/protocol';
import type { Chain } from '../chain/ports';
import type { Db } from '../db/client';
import { reservations } from '../db/schema';
import { AppError, badRequest } from '../errors';
import { balance, reserved } from './ledger';

/** Reservasi dilepas setelah voucher kedaluwarsa + margin ini (tx yang masuk blok di detik terakhir). */
export const RELEASE_MARGIN_MS = 60_000;

type Deps = { db: Db; chain: Chain; now: () => number };

export async function issueVoucher({ db, chain, now }: Deps, buyer: Address, tier: number): Promise<VoucherResponse> {
  if (!Number.isInteger(tier) || tier < 1 || tier > MAX_TIER) throw badRequest(`tier harus 1–${MAX_TIER}`);
  const car = CARS[tier]!;

  // Status lulus dibaca langsung dari kontrak, bukan dari cache DB (TECH_SPEC §5.5).
  const [qualified, owned, minted] = await Promise.all([
    chain.reads.isQualified(buyer, tier),
    chain.reads.ownsTier(buyer, tier),
    chain.reads.minted(tier),
  ]).catch((err: Error) => {
    throw new AppError(503, 'CHAIN_UNAVAILABLE', `Gagal membaca chain: ${err.message}`);
  });
  if (!qualified) throw new AppError(403, 'NOT_QUALIFIED', `Belum lulus syarat ${car.reqNearMiss} mepet untuk ${car.name}`);
  if (owned) throw new AppError(409, 'ALREADY_OWNED', `Sudah memiliki ${car.name}`);
  if (minted >= BigInt(car.supply)) throw new AppError(409, 'SOLD_OUT', `${car.name} sudah habis`);

  const existing = activeReservation(db, buyer, tier, now());
  if (existing) return existing;

  // Tanda tangan dibuat di luar transaksi DB (async); kalau ternyata ada reservasi paralel, yang lama dipakai.
  const t = now();
  const nonce = BigInt(`0x${randomBytes(32).toString('hex')}`);
  const expiry = BigInt(Math.floor(t / 1000) + CHAIN.voucherTtlSec);
  const message = { buyer, tier, coinCost: car.coinCost, nonce, expiry };
  const signature = await chain.voucher.sign(message);
  const response: VoucherResponse = {
    voucher: { buyer, tier, coinCost: car.coinCost, nonce: nonce.toString(), expiry: Number(expiry) },
    signature,
    expiresAt: Number(expiry) * 1000,
  };

  return db.transaction((tx) => {
    const again = activeReservation(tx as unknown as Db, buyer, tier, t);
    if (again) return again;
    const available = balance(tx as unknown as Db, buyer) - reserved(tx as unknown as Db, buyer);
    if (available < car.coinCost) {
      throw new AppError(409, 'INSUFFICIENT_COINS', `Koin kurang: butuh ${car.coinCost}, tersedia ${available}`);
    }
    tx.insert(reservations).values({
      nonce: nonce.toString(), address: buyer, tier, coinCost: car.coinCost, expiresAt: response.expiresAt,
      status: 'ACTIVE', voucherJson: JSON.stringify(response), createdAt: t,
    }).run();
    return response;
  });
}

/** Voucher aktif yang belum kedaluwarsa untuk (pembeli, tier): dikembalikan lagi supaya double-click tidak menyisihkan koin dua kali. */
function activeReservation(db: Db, buyer: Address, tier: number, t: number): VoucherResponse | null {
  const row = db
    .select()
    .from(reservations)
    .where(and(eq(reservations.address, buyer), eq(reservations.tier, tier), eq(reservations.status, 'ACTIVE'), gt(reservations.expiresAt, t)))
    .get();
  return row?.voucherJson ? (JSON.parse(row.voucherJson) as VoucherResponse) : null;
}

/** Job berkala: reservasi kedaluwarsa tanpa event Purchased → RELEASED. */
export function releaseExpiredReservations(db: Db, t: number): number {
  return db
    .update(reservations)
    .set({ status: 'RELEASED' })
    .where(and(eq(reservations.status, 'ACTIVE'), lt(reservations.expiresAt, t - RELEASE_MARGIN_MS)))
    .run().changes;
}

