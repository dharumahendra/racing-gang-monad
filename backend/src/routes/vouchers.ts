import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { VoucherResponse } from '@racing-gang/config/protocol';
import { issueVoucher } from '../services/vouchers';
import type { AppContext } from '../app';

const body = z.object({ tier: z.number().int() });

export async function voucherRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/vouchers', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req): Promise<VoucherResponse> => {
    const address = await ctx.auth.fromRequest(req);
    const { tier } = body.parse(req.body);
    return issueVoucher(ctx, address, tier);
  });
}
