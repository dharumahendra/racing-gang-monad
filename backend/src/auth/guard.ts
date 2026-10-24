// Identitas pemain untuk REST (`Authorization: Bearer <token>`) dan WS (`?token=<token>`).
// - Token Privy (ES256): login utama Privy + Google.
// - JWT game (HS256) dari /auth/verify: hanya kalau ALLOW_SIWE_LOGIN=true (bot dan pengembangan).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { decodeProtectedHeader } from 'jose';
import { getAddress } from 'viem';
import type { Address } from '@racing-gang/config/protocol';
import { unauthorized } from '../errors';
import type { PrivyAuth } from './privy';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

export class Authenticator {
  readonly #app: FastifyInstance;
  readonly #privy: PrivyAuth | null;
  readonly #allowSiwe: boolean;

  constructor(app: FastifyInstance, privy: PrivyAuth | null, allowSiwe: boolean) {
    this.#app = app;
    this.#privy = privy;
    this.#allowSiwe = allowSiwe;
  }

  /** Alamat wallet pemilik token. Melempar 401 kalau token tidak valid atau jalurnya tidak diaktifkan. */
  async authenticate(token: string | undefined): Promise<Address> {
    if (!token) throw unauthorized();
    let alg: string | undefined;
    try {
      alg = decodeProtectedHeader(token).alg;
    } catch {
      throw unauthorized('Token tidak valid');
    }
    if (alg === 'ES256' && this.#privy) return this.#privy.authenticate(token);
    if (alg === 'HS256' && this.#allowSiwe) {
      try {
        return getAddress(this.#app.jwt.verify<{ sub: string }>(token).sub);
      } catch {
        throw unauthorized('Token tidak valid atau kedaluwarsa');
      }
    }
    throw unauthorized('Jenis token tidak diterima server ini');
  }

  fromRequest(req: FastifyRequest): Promise<Address> {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    return this.authenticate(token);
  }
}
