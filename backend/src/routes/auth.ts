import type { FastifyInstance } from 'fastify';
import { getAddress, isAddress } from 'viem';
import { generateSiweNonce } from 'viem/siwe';
import { z } from 'zod';
import type { AuthNonceResponse, AuthVerifyResponse } from '@racing-gang/config/protocol';
import { verifySiwe } from '../auth/siwe';
import { users } from '../db/schema';
import type { AppContext } from '../app';

const nonceBody = z.object({ address: z.string().refine((a) => isAddress(a, { strict: false }), 'alamat tidak valid') });
const verifyBody = z.object({
  message: z.string().min(1).max(4000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, 'signature harus hex'),
});

export const JWT_TTL = '12h';

/**
 * Login SIWE langsung dengan wallet (bot dan pengembangan). Login utama adalah Privy + Google, yang tidak
 * butuh endpoint di sini: frontend langsung mengirim access token Privy (lihat auth/guard.ts).
 */
export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  if (!ctx.env.ALLOW_SIWE_LOGIN) return;
  const limit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  app.post('/auth/nonce', limit, async (req): Promise<AuthNonceResponse> => {
    const { address } = nonceBody.parse(req.body);
    const nonce = generateSiweNonce();
    ctx.nonces.put(nonce, getAddress(address));
    return { nonce };
  });

  app.post('/auth/verify', limit, async (req): Promise<AuthVerifyResponse> => {
    const { message, signature } = verifyBody.parse(req.body);
    const now = ctx.now();
    const address = await verifySiwe({
      message,
      signature: signature as `0x${string}`,
      domain: new URL(ctx.env.PUBLIC_ORIGIN).host,
      chainId: ctx.env.CHAIN_ID,
      nonces: ctx.nonces,
      now,
    });
    ctx.db.insert(users).values({ address, createdAt: now }).onConflictDoNothing().run();
    return { token: app.jwt.sign({ sub: address }, { expiresIn: JWT_TTL }) };
  });
}
