import type { FastifyInstance } from 'fastify';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ActiveRunResponse, Address, CreateRunResponse, Hex, RunLogResponse, RunSummaryResponse } from '@racing-gang/config/protocol';
import type { EndReasonName, VehicleType } from '@racing-gang/config';
import { nearMisses, runEntries, runs } from '../db/schema';
import { AppError, notFound } from '../errors';
import type { AppContext } from '../app';

const createBody = z.object({
  carTier: z.number().int().min(0),
  roomCode: z.string().trim().min(1).max(16).optional(),
});
const idParam = z.object({ id: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'runId harus bytes32 hex') });

export async function runRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/runs', async (req): Promise<CreateRunResponse> => {
    const address = await ctx.auth.fromRequest(req);
    const { carTier, roomCode } = createBody.parse(req.body);
    return ctx.runs.create(address, carTier, roomCode?.toUpperCase());
  });

  /**
   * Run aktif milik pemain yang login (rekonsiliasi setelah POST /runs ambigu). Identitas hanya dari token;
   * tidak ada parameter alamat, jadi pemain lain tidak bisa melihat run aktif orang lain lewat sini.
   */
  app.get('/runs/active', async (req): Promise<ActiveRunResponse> => {
    const address = await ctx.auth.fromRequest(req);
    const s = ctx.runs.active(address);
    if (!s || s.ended) return { run: null, creating: ctx.runs.isCreating(address) };
    const r = ctx.db.select({ seedBlock: runs.seedBlock, configVersion: runs.configVersion }).from(runs).where(eq(runs.id, s.runId)).get();
    if (!r) return { run: null, creating: false };
    return {
      creating: false,
      run: {
        runId: s.runId, seed: s.seed, seedBlock: r.seedBlock, configVersion: r.configVersion, carTier: s.carTier,
        roomCode: s.roomCode, lifecycle: s.lifecycle, startAt: s.startAt, createdAt: s.createdAt, controlled: s.controller !== null,
      },
    };
  });

  app.get('/runs/:id', async (req): Promise<RunSummaryResponse> => {
    const { id } = idParam.parse(req.params);
    const r = ctx.db.select().from(runs).where(eq(runs.id, id)).get();
    if (!r) throw notFound('Run tidak ditemukan');
    const list = ctx.db.select().from(nearMisses).where(eq(nearMisses.runId, id)).orderBy(asc(nearMisses.idx)).all();
    return {
      runId: r.id as Hex, player: r.address as Address, carTier: r.carTier, seed: r.seed as Hex, seedBlock: r.seedBlock,
      configVersion: r.configVersion, roomCode: r.roomCode, lifecycle: r.lifecycle, result: r.result, chainStatus: r.chainStatus,
      endReason: r.endReason as EndReasonName | null, endTick: r.endTick, nearMisses: r.nearMisses, finalHash: r.finalHash as Hex | null,
      startAt: r.startAt, createdAt: r.createdAt,
      nearMissList: list.map((n) => ({
        index: n.idx, tick: n.tick, vehicleType: n.vehicleType as VehicleType, coins: n.coins, inputHash: n.inputHash as Hex,
        txHash: n.txHash as Hex | null, blockNumber: n.blockNumber,
      })),
    };
  });

  /** Log lengkap untuk audit; hanya setelah run selesai (TECH_SPEC §3.8). */
  app.get('/runs/:id/log', async (req): Promise<RunLogResponse> => {
    const { id } = idParam.parse(req.params);
    const r = ctx.db.select().from(runs).where(eq(runs.id, id)).get();
    if (!r) throw notFound('Run tidak ditemukan');
    if (r.lifecycle !== 'ENDED') throw new AppError(409, 'RUN_NOT_ENDED', 'Log tersedia setelah run selesai');
    const entries = ctx.db
      .select({ tick: runEntries.tick, kind: runEntries.kind, data: runEntries.data })
      .from(runEntries)
      .where(eq(runEntries.runId, id))
      .orderBy(asc(runEntries.ord))
      .all();
    return {
      runId: r.id as Hex, seed: r.seed as Hex, seedBlock: r.seedBlock, player: r.address as Address,
      carTier: r.carTier, configVersion: r.configVersion, entries,
    };
  });
}
