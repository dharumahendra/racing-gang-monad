import type { FastifyInstance } from 'fastify';
import { asc, desc, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Address, Hex, LeaderboardResponse } from '@racing-gang/config/protocol';
import { runs } from '../db/schema';
import type { AppContext } from '../app';

const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

/** Mepet terbanyak dalam satu run (P1). Run INVALID tidak ikut. */
export async function leaderboardRoutes(app: FastifyInstance, { db }: AppContext) {
  app.get('/leaderboard', async (req): Promise<LeaderboardResponse> => {
    const { limit } = query.parse(req.query);
    const rows = db
      .select({ runId: runs.id, player: runs.address, carTier: runs.carTier, nearMisses: runs.nearMisses, endedAt: runs.endedAt, createdAt: runs.createdAt })
      .from(runs)
      .where(inArray(runs.result, ['VERIFIED', 'PARTIAL']))
      .orderBy(desc(runs.nearMisses), asc(runs.endedAt))
      .limit(limit)
      .all();
    return {
      entries: rows.map((r) => ({
        runId: r.runId as Hex, player: r.player as Address, carTier: r.carTier, nearMisses: r.nearMisses, endedAt: r.endedAt ?? r.createdAt,
      })),
    };
  });
}
