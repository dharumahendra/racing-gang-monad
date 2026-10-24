// Ledger koin (TECH_SPEC §5.5). Saldo = SUM(delta). Kredit/debit hanya dari event chain, idempoten lewat `ref`.
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import type { Address } from '@racing-gang/config/protocol';
import type { Db } from '../db/client';
import { coinLedger, nearMisses, reservations, runs } from '../db/schema';

/** Tambah baris ledger. Mengembalikan false kalau `ref` sudah pernah dicatat. */
export function addLedgerEntry(db: Db, address: Address, delta: number, ref: string, now: number): boolean {
  const r = db.insert(coinLedger).values({ address, delta, ref, createdAt: now }).onConflictDoNothing({ target: coinLedger.ref }).run();
  return r.changes > 0;
}

export function balance(db: Db, address: Address): number {
  const row = db.select({ v: sql<number>`coalesce(sum(${coinLedger.delta}), 0)` }).from(coinLedger).where(eq(coinLedger.address, address)).get();
  return Number(row?.v ?? 0);
}

export function reserved(db: Db, address: Address): number {
  const row = db
    .select({ v: sql<number>`coalesce(sum(${reservations.coinCost}), 0)` })
    .from(reservations)
    .where(and(eq(reservations.address, address), eq(reservations.status, 'ACTIVE')))
    .get();
  return Number(row?.v ?? 0);
}

/** Koin dari mepet yang sudah terverifikasi tapi belum tercatat on-chain (hanya tampilan). */
export function pending(db: Db, address: Address): number {
  const row = db
    .select({ v: sql<number>`coalesce(sum(${nearMisses.coins}), 0)` })
    .from(nearMisses)
    .innerJoin(runs, eq(runs.id, nearMisses.runId))
    .where(and(eq(runs.address, address), isNull(nearMisses.recordedAt), or(isNull(runs.result), ne(runs.result, 'INVALID'))))
    .get();
  return Number(row?.v ?? 0);
}
