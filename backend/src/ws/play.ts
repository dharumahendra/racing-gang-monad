// WebSocket pemain: /ws/play?token=<JWT> (TECH_SPEC §4.1, BACKEND_PLAN G3).
import type { FastifyInstance } from 'fastify';
import type { RawData } from 'ws';
import { z } from 'zod';
import type { Address, Hex, PlayS2C, WsErrorCode } from '@racing-gang/config/protocol';
import type { AppContext } from '../app';
import { AppError } from '../errors';
import { send } from './hub';

const int = z.number().int();
const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

const playMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('ping'), clientMs: z.number() }),
  z.object({ t: z.literal('run.ready'), runId: hex32 }),
  z.object({ t: z.literal('input'), tick: int, kind: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), seq: int.positive() }),
  z.object({ t: z.literal('watermark'), tick: int.min(0) }),
  z.object({ t: z.literal('disruption.ack'), id: z.string().max(64), applied: z.boolean() }),
  z.object({ t: z.literal('snapshot'), tick: int, x: int, z: int, speed: int, targetLane: int, nearMisses: int }),
  z.object({ t: z.literal('run.end'), tick: int, reason: z.enum(['TIME_UP', 'CRASH', 'RED_ZONE_FAIL', 'TIMEOUT']), nearMisses: int, inputHash: hex32 }),
]);

/** Batas pesan per detik per koneksi; input + watermark + snapshot normalnya < 30/dtk. */
const MAX_MSG_PER_SEC = 120;
const SNAPSHOT_MIN_GAP_MS = 80;

export async function playSocket(app: FastifyInstance, ctx: AppContext) {
  // Rate limit HTTP tidak dipakai di sini; batas pesan per koneksi ada di bawah.
  app.get('/ws/play', { websocket: true, config: { rateLimit: false } }, (socket, req) => {
    const err = (code: WsErrorCode, message: string) => send(socket, { t: 'error', code, message } satisfies PlayS2C);

    // Verifikasi token bisa async (login Privy pertama membaca wallet dari server Privy).
    // Pesan yang datang sebelum selesai disimpan lalu diproses berurutan.
    let address: Address | null = null;
    let closed = false;
    const early: RawData[] = [];
    let lastRunId: Hex | undefined;
    let windowStart = ctx.now();
    let count = 0;
    let lastSnapshotAt = 0;

    socket.on('message', (raw) => {
      if (!address) {
        if (early.length < MAX_MSG_PER_SEC) early.push(raw);
        return;
      }
      handle(raw);
    });
    socket.on('close', () => {
      closed = true;
      if (address) ctx.hub.detachPlayer(address, socket);
    });

    ctx.auth
      .authenticate((req.query as { token?: string }).token)
      .then((a) => {
        if (closed) return;
        address = a;
        ctx.hub.attachPlayer(a, socket);
        lastRunId = ctx.runs.active(a)?.runId;
        ctx.runs.active(a)?.resendOnReconnect();
        for (const raw of early.splice(0)) handle(raw);
      })
      .catch((e: unknown) => {
        // Semua kegagalan autentikasi di WS memakai kode UNAUTHORIZED; pesannya menjelaskan penyebab (mis. wallet belum siap).
        err('UNAUTHORIZED', e instanceof AppError ? e.message : 'Token tidak valid atau kedaluwarsa');
        setImmediate(() => socket.close(4401, 'unauthorized'));
      });

    function handle(raw: RawData) {
      if (!address) return;
      const t = ctx.now();
      if (t - windowStart >= 1000) { windowStart = t; count = 0; }
      if (++count > MAX_MSG_PER_SEC) {
        err('BAD_MESSAGE', 'Terlalu banyak pesan');
        socket.close(4429, 'rate limit');
        return;
      }

      let msg: z.infer<typeof playMessage>;
      try {
        msg = playMessage.parse(JSON.parse(raw.toString()));
      } catch {
        return err('BAD_MESSAGE', 'Pesan tidak valid');
      }

      if (msg.t === 'ping') return send(socket, { t: 'pong', clientMs: msg.clientMs, serverMs: t } satisfies PlayS2C);

      const s = ctx.runs.active(address);
      if (s) lastRunId = s.runId;

      if (msg.t === 'run.end') {
        if (lastRunId) ctx.runs.recordClaim(lastRunId, { tick: msg.tick, reason: msg.reason, nearMisses: msg.nearMisses, inputHash: msg.inputHash as Hex });
        return;
      }
      if (!s) return err('NO_ACTIVE_RUN', 'Tidak ada run aktif');

      switch (msg.t) {
        case 'run.ready':
          if (msg.runId.toLowerCase() !== s.runId.toLowerCase()) return err('NO_ACTIVE_RUN', 'runId bukan run aktif');
          return s.ready();
        case 'input':
          return s.onInput(msg);
        case 'watermark':
          return s.onWatermark(msg.tick);
        case 'disruption.ack':
          return s.onAck(msg.id, msg.applied);
        case 'snapshot':
          if (t - lastSnapshotAt < SNAPSHOT_MIN_GAP_MS) return;
          lastSnapshotAt = t;
          return ctx.hub.toRoom(s.roomCode, { ...msg, t: 'run.snapshot' });
      }
    }
  });
}
