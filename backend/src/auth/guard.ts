import type { FastifyRequest } from 'fastify';
import { getAddress } from 'viem';
import type { Address } from '@racing-gang/config/protocol';
import { unauthorized } from '../errors';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

/** Verifikasi JWT dari header `Authorization: Bearer <token>` dan kembalikan alamat pemain. */
export async function requireAuth(req: FastifyRequest): Promise<Address> {
  try {
    await req.jwtVerify();
  } catch {
    throw unauthorized('Token tidak valid atau kedaluwarsa');
  }
  return getAddress(req.user.sub);
}
