// WebSocket penonton: /ws/watch?room=<KODE>&nick=<opsional> (TECH_SPEC §4.2). Tanpa wallet dan tanpa login.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { WatchS2C } from '@racing-gang/config/protocol';
import type { AppContext } from '../app';
import { send } from './hub';

const watchMessage = z.discriminatedUnion('kind', [
  z.object({ t: z.literal('disrupt'), kind: z.literal('NITRO') }),
  z.object({ t: z.literal('disrupt'), kind: z.literal('SPIKES'), lane: z.number().int().min(0).max(3) }),
  z.object({
    t: z.literal('disrupt'), kind: z.literal('RED'), lane: z.number().int().min(0).max(3),
    durationIndex: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  }),
]);

export async function watchSocket(app: FastifyInstance, ctx: AppContext) {
  // Rate limit HTTP tidak dipakai di sini; batas pesan per penonton ada di RoomManager.
  app.get('/ws/watch', { websocket: true, config: { rateLimit: false } }, (socket, req) => {
    const q = req.query as { room?: string; nick?: string };
    const code = (q.room ?? '').trim().toUpperCase();
    const joined = ctx.rooms.join(code, q.nick, socket);
    if (!joined.ok) {
      setImmediate(() => {
        send(socket, { t: 'error', code: joined.code, message: joined.message } satisfies WatchS2C);
        socket.close(4404, joined.code);
      });
      return;
    }

    socket.on('message', (raw) => {
      let msg: z.infer<typeof watchMessage>;
      try {
        msg = watchMessage.parse(JSON.parse(raw.toString()));
      } catch {
        return send(socket, { t: 'error', code: 'BAD_MESSAGE', message: 'Pesan tidak valid' } satisfies WatchS2C);
      }
      const res = ctx.rooms.disrupt(code, socket, msg);
      send(socket, (res.ok ? { t: 'disrupt.accepted', id: res.id } : { t: 'disrupt.rejected', reason: res.reason }) satisfies WatchS2C);
    });

    socket.on('close', () => ctx.rooms.leave(code, socket));
  });
}
