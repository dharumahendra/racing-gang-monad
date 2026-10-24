// Skema DB (TECH_SPEC §5.6 + keputusan BACKEND_PLAN F2). Semua waktu dalam ms epoch.
// Alamat selalu disimpan dalam format checksum (viem getAddress).
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { RunChainStatus, RunLifecycle, RunResultStatus } from '@racing-gang/config';

export const users = sqliteTable('users', {
  address: text('address').primaryKey(),
  createdAt: integer('created_at').notNull(),
});

/** Saldo koin = SUM(delta). `ref` unik supaya kredit/debit dari event chain idempoten. */
export const coinLedger = sqliteTable(
  'coin_ledger',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    address: text('address').notNull(),
    delta: integer('delta').notNull(),
    ref: text('ref').notNull().unique(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('coin_ledger_address').on(t.address)],
);

export type ReservationStatus = 'ACTIVE' | 'CONSUMED' | 'RELEASED';
export const reservations = sqliteTable(
  'reservations',
  {
    /** uint256 sebagai string desimal. */
    nonce: text('nonce').primaryKey(),
    address: text('address').notNull(),
    tier: integer('tier').notNull(),
    coinCost: integer('coin_cost').notNull(),
    expiresAt: integer('expires_at').notNull(),
    status: text('status').$type<ReservationStatus>().notNull(),
    voucherJson: text('voucher_json'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('reservations_address_status').on(t.address, t.status)],
);

/** Cache event `Qualified`. BUKAN gerbang pembelian; sumber kebenarannya kontrak. */
export const qualifications = sqliteTable(
  'qualifications',
  {
    address: text('address').notNull(),
    tier: integer('tier').notNull(),
    runId: text('run_id').notNull(),
    txHash: text('tx_hash').notNull(),
    blockNumber: integer('block_number').notNull(),
  },
  (t) => [primaryKey({ columns: [t.address, t.tier] })],
);

/** Cache event `Purchased`, untuk /me tanpa memanggil RPC. */
export const ownedCars = sqliteTable(
  'owned_cars',
  {
    address: text('address').notNull(),
    tier: integer('tier').notNull(),
    tokenId: text('token_id').notNull(),
    runId: text('run_id').notNull(),
    txHash: text('tx_hash').notNull(),
  },
  (t) => [primaryKey({ columns: [t.address, t.tier] })],
);

export const rooms = sqliteTable('rooms', {
  code: text('code').primaryKey(),
  hostAddress: text('host_address').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    address: text('address').notNull(),
    carTier: integer('car_tier').notNull(),
    seed: text('seed').notNull(),
    seedBlock: integer('seed_block').notNull(),
    roomCode: text('room_code'),
    configVersion: integer('config_version').notNull(),
    lifecycle: text('lifecycle').$type<RunLifecycle>().notNull(),
    result: text('result').$type<RunResultStatus>(),
    chainStatus: text('chain_status').$type<RunChainStatus>().notNull(),
    endReason: text('end_reason'),
    endTick: integer('end_tick'),
    nearMisses: integer('near_misses').notNull().default(0),
    /** Tick terakhir yang sudah diverifikasi sim backend; dipakai untuk menutup run setelah server restart. */
    verifiedTick: integer('verified_tick').notNull().default(0),
    finalHash: text('final_hash'),
    startAt: integer('start_at'),
    createdAt: integer('created_at').notNull(),
    /** JSON array flag anti-cheat, mis. ["SPEEDHACK"]. */
    flags: text('flags').notNull().default('[]'),
  },
  (t) => [index('runs_address_created').on(t.address, t.createdAt), index('runs_lifecycle').on(t.lifecycle)],
);

/** Log run. `ord` = urutan proses = urutan hash; audit replay berdasarkan `ord`. */
export const runEntries = sqliteTable(
  'run_entries',
  {
    runId: text('run_id').notNull(),
    ord: integer('ord').notNull(),
    tick: integer('tick').notNull(),
    kind: integer('kind').notNull(),
    data: integer('data').notNull(),
    source: text('source').$type<'PLAYER' | 'SPECTATOR'>().notNull(),
    clientSeq: integer('client_seq'),
    disruptionId: text('disruption_id'),
  },
  (t) => [primaryKey({ columns: [t.runId, t.ord] })],
);

export const disruptions = sqliteTable(
  'disruptions',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    source: text('source').$type<'NPC' | 'SPECTATOR'>().notNull(),
    kind: text('kind').$type<'NITRO' | 'SPIKES' | 'RED'>().notNull(),
    /** JSON array lajur. */
    lanes: text('lanes').notNull(),
    durationIndex: integer('duration_index'),
    warnTick: integer('warn_tick').notNull(),
    schedOrder: integer('sched_order').notNull(),
    acked: integer('acked', { mode: 'boolean' }).notNull().default(false),
    applied: integer('applied', { mode: 'boolean' }),
    spectatorNick: text('spectator_nick'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('disruptions_run').on(t.runId)],
);

export const nearMisses = sqliteTable(
  'near_misses',
  {
    runId: text('run_id').notNull(),
    idx: integer('idx').notNull(),
    tick: integer('tick').notNull(),
    vehicleId: integer('vehicle_id').notNull(),
    vehicleType: integer('vehicle_type').notNull(),
    coins: integer('coins').notNull(),
    inputHash: text('input_hash').notNull(),
    txHash: text('tx_hash'),
    blockNumber: integer('block_number'),
    verifiedAt: integer('verified_at').notNull(),
    recordedAt: integer('recorded_at'),
  },
  (t) => [primaryKey({ columns: [t.runId, t.idx] })],
);

export const chainCursor = sqliteTable('chain_cursor', {
  name: text('name').primaryKey(),
  lastBlock: integer('last_block').notNull(),
});
