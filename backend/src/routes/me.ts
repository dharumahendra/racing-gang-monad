import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Hex, MeResponse } from '@racing-gang/config/protocol';
import { ownedCars, qualifications, runs } from '../db/schema';
import { balance, pending, reserved } from '../services/ledger';
import type { AppContext } from '../app';

export async function meRoutes(app: FastifyInstance, { db, auth }: AppContext) {
  app.get('/me', async (req): Promise<MeResponse> => {
    const address = await auth.fromRequest(req);
    const owned = db.select({ tier: ownedCars.tier }).from(ownedCars).where(eq(ownedCars.address, address)).all();
    const qualified = db.select({ tier: qualifications.tier }).from(qualifications).where(eq(qualifications.address, address)).all();
    const best = db
      .select({ runId: runs.id, nearMisses: runs.nearMisses })
      .from(runs)
      .where(and(eq(runs.address, address), inArray(runs.result, ['VERIFIED', 'PARTIAL'])))
      .orderBy(desc(runs.nearMisses), runs.createdAt)
      .limit(1)
      .get();
    return {
      address,
      coins: balance(db, address),
      coinsPending: pending(db, address),
      coinsReserved: reserved(db, address),
      ownedTiers: owned.map((r) => r.tier).sort(),
      qualifiedTiers: qualified.map((r) => r.tier).sort(),
      bestRun: best ? { runId: best.runId as Hex, nearMisses: best.nearMisses } : null,
    };
  });
}
