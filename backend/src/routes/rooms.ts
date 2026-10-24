import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CreateRoomResponse, RoomResponse } from '@racing-gang/config/protocol';
import { notFound } from '../errors';
import type { AppContext } from '../app';

const codeParam = z.object({ code: z.string().trim().min(1).max(16) });

export async function roomRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/rooms', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req): Promise<CreateRoomResponse> => {
    const address = await ctx.auth.fromRequest(req);
    return ctx.rooms.create(address);
  });

  /** Status room; host memakainya untuk jumlah penonton (polling). */
  app.get('/rooms/:code', async (req): Promise<RoomResponse> => {
    const { code } = codeParam.parse(req.params);
    const info = ctx.rooms.info(code);
    if (!info) throw notFound('Room tidak ditemukan');
    return info;
  });
}
