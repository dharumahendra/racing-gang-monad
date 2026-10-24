// Kontrak pesan antara frontend dan backend: WebSocket (TECH_SPEC §4) dan REST (§5.1).
// File ini dibekukan di M0. Perubahan setelahnya harus disepakati bertiga (TASKS §0 aturan #4).
// Semua pesan WS berbentuk { t: '<tipe>', ...payload }. Waktu dalam ms epoch.
// Nilai uint256 dan bigint dikirim sebagai string desimal; nomor blok sebagai number.
import type {
  DisruptionKind,
  DurationIndex,
  EndReasonName,
  PlayerInputKind,
  RunChainStatus,
  RunLifecycle,
  RunResultStatus,
  VehicleType,
} from './enums';

export type Hex = `0x${string}`;
export type Address = `0x${string}`;

// ─── Bagian bersama ─────────────────────────────────────────────────────────

export type PlayerSnapshot = {
  tick: number;
  x: number;
  z: number;
  speed: number;
  targetLane: number;
  nearMisses: number;
};

export type DisruptionScheduled = {
  t: 'disruption.scheduled';
  id: string;
  kind: DisruptionKind;
  lanes: number[];
  durationIndex?: DurationIndex;
  warnTick: number;
  /** Nick penonton pengirim. */
  by: string;
};

export type NearMissRecorded = {
  t: 'nearMiss.recorded';
  index: number;
  txHash: Hex;
  blockNumber: number;
  latencyMs: number;
};

export type RunResult = {
  t: 'run.result';
  status: RunResultStatus;
  reason: EndReasonName;
  endTick: number;
  nearMisses: number;
  coins: number;
  qualifiedTiers: number[];
};

export type WsError = { t: 'error'; code: WsErrorCode; message: string };

export type WsErrorCode =
  | 'UNAUTHORIZED'
  | 'BAD_MESSAGE'
  | 'NO_ACTIVE_RUN'
  | 'RUN_NOT_READY'
  | 'RUN_ENDED'
  | 'RECORD_FAILED'
  | 'SEED_MISMATCH'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_EXPIRED'
  | 'ROOM_FULL';

// ─── /ws/play?token=<JWT> (§4.1) ────────────────────────────────────────────

export type PlayC2S =
  | { t: 'ping'; clientMs: number }
  | { t: 'run.ready'; runId: Hex }
  /** Kirim segera saat tombol ditekan; tick = tickSekarang + 1. */
  | { t: 'input'; tick: number; kind: PlayerInputKind; seq: number }
  /** Setiap 100 ms; janji tidak ada input lagi untuk tick ≤ nilai ini. */
  | { t: 'watermark'; tick: number }
  /** applied = true jika diterima saat tick lokal < warnTick. */
  | { t: 'disruption.ack'; id: string; applied: boolean }
  /** 10 Hz; hanya untuk tampilan penonton, tidak dipakai verifikasi. */
  | ({ t: 'snapshot' } & PlayerSnapshot)
  /** Klaim client; hasil backend tetap yang berlaku. */
  | { t: 'run.end'; tick: number; reason: EndReasonName; nearMisses: number; inputHash: Hex };

export type PlayS2C =
  | { t: 'pong'; clientMs: number; serverMs: number }
  /** Tick 1 terjadi di startAt + 33,3 ms. */
  | { t: 'run.go'; startAt: number }
  | DisruptionScheduled
  | { t: 'nearMiss.verified'; index: number; tick: number; vehicleType: VehicleType; coins: number }
  | NearMissRecorded
  | { t: 'run.qualified'; tier: number; txHash: Hex }
  | RunResult
  | WsError;

// ─── /ws/watch?room=<KODE>&nick=<opsional> (§4.2) ───────────────────────────

export type RoomRunInfo = { runId: Hex; seed: Hex; carTier: number; startAt: number | null };

export type DisruptRejectReason = 'ENERGY' | 'LIMIT' | 'NO_RUN' | 'RATE' | 'ROOM_EXPIRED';

export type WatchC2S = {
  t: 'disrupt';
  kind: DisruptionKind;
  /** Wajib untuk SPIKES dan RED (0–3). */
  lane?: number;
  /** Wajib untuk RED: 0/1/2 = 3/5/7 detik. */
  durationIndex?: DurationIndex;
};

export type WatchS2C =
  | { t: 'room.state'; code: string; expiresAt: number; spectators: number; run: RoomRunInfo | null }
  | ({ t: 'run.snapshot' } & PlayerSnapshot)
  | DisruptionScheduled
  | { t: 'energy'; value: number }
  | { t: 'disrupt.accepted'; id: string }
  | { t: 'disrupt.rejected'; reason: DisruptRejectReason }
  | NearMissRecorded
  | RunResult
  | WsError;

// ─── REST (§5.1) ────────────────────────────────────────────────────────────

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'ACTIVE_RUN_EXISTS'
  | 'RUN_LIMIT'
  | 'RUN_NOT_ENDED'
  | 'CAR_NOT_OWNED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_EXPIRED'
  | 'ROOM_BUSY'
  | 'NOT_ROOM_HOST'
  | 'NOT_QUALIFIED'
  | 'ALREADY_OWNED'
  | 'SOLD_OUT'
  | 'INSUFFICIENT_COINS'
  | 'CHAIN_UNAVAILABLE';

export type ApiError = { error: { code: ApiErrorCode; message: string } };

/** POST /auth/nonce */
export type AuthNonceRequest = { address: Address };
export type AuthNonceResponse = { nonce: string };

/** POST /auth/verify (SIWE) → JWT 12 jam */
export type AuthVerifyRequest = { message: string; signature: Hex };
export type AuthVerifyResponse = { token: string };

/** GET /me */
export type MeResponse = {
  address: Address;
  coins: number;
  coinsPending: number;
  coinsReserved: number;
  ownedTiers: number[];
  qualifiedTiers: number[];
  bestRun: { runId: Hex; nearMisses: number } | null;
};

/** GET /config: isi packages/config + alamat kontrak. */
export type ConfigResponse = {
  configVersion: number;
  chainId: number;
  explorerUrl: string | null;
  contracts: { runRegistry: Address; carNFT: Address } | null;
  constants: Record<string, unknown>;
};

/** POST /rooms */
export type CreateRoomResponse = { code: string; expiresAt: number };

/** GET /rooms/:code */
export type RoomResponse = { code: string; expiresAt: number; spectators: number; run: RoomRunInfo | null };

/** POST /runs */
export type CreateRunRequest = { carTier: number; roomCode?: string };
export type CreateRunResponse = { runId: Hex; seed: Hex; seedBlock: number; configVersion: number };

export type NearMissInfo = {
  index: number;
  tick: number;
  vehicleType: VehicleType;
  coins: number;
  inputHash: Hex;
  txHash: Hex | null;
  blockNumber: number | null;
};

/** GET /runs/:id */
export type RunSummaryResponse = {
  runId: Hex;
  player: Address;
  carTier: number;
  seed: Hex;
  seedBlock: number;
  configVersion: number;
  roomCode: string | null;
  lifecycle: RunLifecycle;
  result: RunResultStatus | null;
  chainStatus: RunChainStatus;
  endReason: EndReasonName | null;
  endTick: number | null;
  nearMisses: number;
  startAt: number | null;
  createdAt: number;
  nearMissList: NearMissInfo[];
};

/** GET /runs/:id/log: input untuk replay di packages/sim. Entri urut sesuai urutan proses. */
export type RunLogResponse = {
  runId: Hex;
  seed: Hex;
  seedBlock: number;
  player: Address;
  carTier: number;
  configVersion: number;
  entries: { tick: number; kind: number; data: number }[];
};

/** POST /vouchers */
export type VoucherRequest = { tier: number };
export type Voucher = {
  buyer: Address;
  tier: number;
  coinCost: number;
  /** uint256 sebagai string desimal. */
  nonce: string;
  /** Unix detik. */
  expiry: number;
};
export type VoucherResponse = { voucher: Voucher; signature: Hex; expiresAt: number };

/** GET /leaderboard */
export type LeaderboardResponse = {
  entries: { runId: Hex; player: Address; carTier: number; nearMisses: number; endedAt: number }[];
};
