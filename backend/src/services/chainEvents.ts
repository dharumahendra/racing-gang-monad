// Reaksi terhadap event chain dari indexer atau mock (TECH_SPEC §7.2, BACKEND_PLAN G5).
// Semua handler idempoten: event yang sama boleh datang dua kali (backfill + subscribe).
import { and, eq } from 'drizzle-orm';
import { getAddress } from 'viem';
import { VEHICLE } from '@racing-gang/config';
import type { PlayS2C } from '@racing-gang/config/protocol';
import type { Chain, ChainEvent } from '../chain/ports';
import type { Db } from '../db/client';
import { nearMisses, ownedCars, qualifications, reservations, runs } from '../db/schema';
import type { Hub } from '../ws/hub';
import type { LatencyStats } from './latency';
import { addLedgerEntry } from './ledger';
import type { RunManager } from './runs';

type Deps = {
  db: Db;
  chain: Chain;
  hub: Hub;
  now: () => number;
  runs: RunManager;
  latency?: LatencyStats;
  /** Dipanggil setiap 20 sampel latensi baru (log server). */
  onLatencyReport?: (s: NonNullable<ReturnType<LatencyStats['summary']>>) => void;
};

export function registerChainHandlers(deps: Deps) {
  deps.chain.bus.on((e) => handleChainEvent(deps, e));
}

export function handleChainEvent({ db, hub, now, runs: manager, latency, onLatencyReport }: Deps, e: ChainEvent) {
  const run = 'runId' in e ? db.select().from(runs).where(eq(runs.id, e.runId)).get() : undefined;

  switch (e.type) {
    case 'RunStarted': {
      const s = manager.get(e.runId);
      if (s) return s.confirmSeed(e.seed);
      if (run && run.seed.toLowerCase() !== e.seed.toLowerCase() && run.result !== 'INVALID') {
        const flags = [...(JSON.parse(run.flags) as string[]), 'SEED_MISMATCH'];
        db.update(runs).set({ result: 'INVALID', flags: JSON.stringify(flags) }).where(eq(runs.id, e.runId)).run();
      }
      return;
    }

    case 'NearMiss': {
      const t = now();
      const row = db.select().from(nearMisses).where(and(eq(nearMisses.runId, e.runId), eq(nearMisses.idx, e.index))).get();
      const coins = row?.coins ?? (e.vehicleType === VEHICLE.TRUCK.code ? VEHICLE.TRUCK.coins : VEHICLE.CAR.coins);
      // Ledger mengikuti chain: koin dikreditkan dari event on-chain (PRD §5.4).
      addLedgerEntry(db, getAddress(e.player), coins, `${e.runId}:${e.index}`, t);
      if (!row || row.recordedAt !== null) return;
      db.update(nearMisses)
        .set({ txHash: e.txHash, blockNumber: Number(e.blockNumber), recordedAt: t })
        .where(and(eq(nearMisses.runId, e.runId), eq(nearMisses.idx, e.index)))
        .run();
      const msg: PlayS2C = { t: 'nearMiss.recorded', index: e.index, txHash: e.txHash, blockNumber: Number(e.blockNumber), latencyMs: t - row.verifiedAt };
      if (latency) {
        latency.add(msg.latencyMs);
        const s = latency.summary();
        if (s && latency.total % 20 === 0) onLatencyReport?.(s);
      }
      if (run) {
        hub.toPlayer(getAddress(run.address), msg);
        hub.toRoom(run.roomCode, msg);
      }
      return;
    }

    case 'RunEnded':
      db.update(runs).set({ chainStatus: 'RECORDED' }).where(eq(runs.id, e.runId)).run();
      return;

    case 'Qualified': {
      const player = getAddress(e.player);
      const r = db.insert(qualifications)
        .values({ address: player, tier: e.tier, runId: e.runId, txHash: e.txHash, blockNumber: Number(e.blockNumber) })
        .onConflictDoNothing()
        .run();
      if (r.changes > 0) hub.toPlayer(player, { t: 'run.qualified', tier: e.tier, txHash: e.txHash } satisfies PlayS2C);
      return;
    }

    case 'Purchased': {
      const buyer = getAddress(e.buyer);
      const nonce = e.voucherNonce.toString();
      db.transaction((tx) => {
        addLedgerEntry(tx as unknown as Db, buyer, -e.coinCost, `voucher:${nonce}`, now());
        tx.update(reservations).set({ status: 'CONSUMED' }).where(eq(reservations.nonce, nonce)).run();
        tx.insert(ownedCars)
          .values({ address: buyer, tier: e.tier, tokenId: e.tokenId.toString(), runId: e.runId, txHash: e.txHash })
          .onConflictDoNothing()
          .run();
      });
      return;
    }

    case 'RecordFailed': {
      db.update(runs).set({ chainStatus: 'RECORD_FAILED' }).where(eq(runs.id, e.runId)).run();
      if (run) {
        hub.toPlayer(getAddress(run.address), {
          t: 'error', code: 'RECORD_FAILED', message: `Run gagal dicatat on-chain: ${e.error}`,
        } satisfies PlayS2C);
      }
      return;
    }
  }
}

