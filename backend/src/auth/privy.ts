// Login utama: Privy + Google (PRD §4, TECH_SPEC §5.1).
// 1. Access token Privy diverifikasi: ES256 dengan verification key app, iss = privy.io, aud = App ID, exp.
// 2. Embedded Ethereum wallet pengguna dibaca dari server Privy (bukan dari client) lalu diikat permanen ke DID di tabel users.
// Referensi: docs.privy.io/authentication/user-authentication/access-tokens, docs.privy.io/api-reference/users/get
import { eq } from 'drizzle-orm';
import {
  createLocalJWKSet, errors as joseErrors, importSPKI, jwtVerify,
  type CryptoKey, type JSONWebKeySet, type JWTPayload, type JWTVerifyGetKey, type JWTVerifyOptions,
} from 'jose';
import { getAddress, isAddress } from 'viem';
import type { Address } from '@racing-gang/config/protocol';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { AppError, unauthorized } from '../errors';

export type PrivyConfig = {
  appId: string;
  /** PEM statis. Boleh kosong bila `jwksUrl` diisi. */
  verificationKey?: string;
  /** URL JWKS publik Privy (mis. https://auth.privy.io/api/v1/apps/<id>/jwks.json); mendukung rotasi kunci. */
  jwksUrl?: string;
  appSecret: string;
  apiUrl: string;
};

/** Jeda minimum antar pengambilan ulang JWKS saat menemukan `kid` asing (cegah banjir request). */
const JWKS_REFRESH_MIN_MS = 30_000;

type LinkedAccount = {
  type?: string;
  address?: string;
  chain_type?: string;
  connector_type?: string;
  wallet_client_type?: string;
  wallet_index?: number;
};

export class PrivyAuth {
  readonly #cfg: PrivyConfig;
  readonly #db: Db;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  #key: Promise<CryptoKey> | null = null;
  #jwks: { set: JWTVerifyGetKey; at: number } | null = null;
  #jwksLoading: Promise<JWTVerifyGetKey> | null = null;

  constructor(cfg: PrivyConfig, db: Db, opts: { fetch?: typeof fetch; now?: () => number } = {}) {
    this.#cfg = cfg;
    this.#db = db;
    this.#fetch = opts.fetch ?? fetch;
    this.#now = opts.now ?? Date.now;
  }

  /** Verifikasi access token dan kembalikan alamat wallet akun game. */
  async authenticate(token: string): Promise<Address> {
    const did = await this.verifyToken(token);
    return this.walletOf(did);
  }

  /** Kembalikan DID (`sub`) dari access token yang valid. */
  async verifyToken(token: string): Promise<string> {
    const options = { issuer: 'privy.io', audience: this.#cfg.appId, algorithms: ['ES256'], currentDate: new Date(this.#now()) };
    let payload: JWTPayload;
    try {
      if (this.#cfg.jwksUrl) {
        payload = await this.#verifyWithJwks(token, options);
      } else {
        this.#key ??= importSPKI(this.#cfg.verificationKey!.replace(/\\n/g, '\n'), 'ES256');
        ({ payload } = await jwtVerify(token, await this.#key, options));
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw unauthorized('Sesi Privy tidak valid atau kedaluwarsa');
    }
    if (typeof payload.sub !== 'string' || !payload.sub.startsWith('did:privy:')) throw unauthorized('Sesi Privy tidak valid atau kedaluwarsa');
    return payload.sub;
  }

  /** Verifikasi dengan JWKS cache; `kid` asing memicu satu kali ambil ulang (dibatasi JWKS_REFRESH_MIN_MS). */
  async #verifyWithJwks(token: string, options: JWTVerifyOptions): Promise<JWTPayload> {
    const set = await this.#jwksSet(false);
    try {
      return (await jwtVerify(token, set, options)).payload;
    } catch (err) {
      if (!(err instanceof joseErrors.JWKSNoMatchingKey)) throw err;
      if (this.#jwks && this.#now() - this.#jwks.at < JWKS_REFRESH_MIN_MS) throw err;
      return (await jwtVerify(token, await this.#jwksSet(true), options)).payload;
    }
  }

  async #jwksSet(force: boolean): Promise<JWTVerifyGetKey> {
    if (this.#jwks && !force) return this.#jwks.set;
    this.#jwksLoading ??= (async () => {
      let res: Response;
      try {
        res = await this.#fetch(this.#cfg.jwksUrl!, { signal: AbortSignal.timeout(8000) });
      } catch (err) {
        throw new AppError(503, 'AUTH_PROVIDER_UNAVAILABLE', `JWKS Privy tidak bisa dihubungi: ${(err as Error).message}`);
      }
      if (!res.ok) throw new AppError(503, 'AUTH_PROVIDER_UNAVAILABLE', `JWKS Privy membalas ${res.status}`);
      const body = (await res.json().catch(() => null)) as JSONWebKeySet | null;
      if (!body || !Array.isArray(body.keys)) throw new AppError(503, 'AUTH_PROVIDER_UNAVAILABLE', 'JWKS Privy tidak valid');
      const set = createLocalJWKSet(body);
      this.#jwks = { set, at: this.#now() };
      return set;
    })().finally(() => { this.#jwksLoading = null; });
    return this.#jwksLoading;
  }

  /**
   * Alamat wallet canonical untuk DID ini. Login pertama membaca embedded wallet dari server Privy dan
   * menyimpannya; setelah itu selalu dari DB (tidak bergantung rate limit Privy, tidak ditimpa otomatis).
   */
  async walletOf(did: string): Promise<Address> {
    const known = this.#db.select({ address: users.address }).from(users).where(eq(users.privyDid, did)).get();
    if (known) return getAddress(known.address);

    const address = await this.#fetchEmbeddedWallet(did);
    const existing = this.#db.select().from(users).where(eq(users.address, address)).get();
    if (existing?.privyDid && existing.privyDid !== did) throw unauthorized('Wallet ini sudah terikat ke akun lain');
    if (existing) {
      // Akun yang sebelumnya dibuat lewat SIWE dengan wallet yang sama: ikat ke DID ini.
      this.#db.update(users).set({ privyDid: did }).where(eq(users.address, address)).run();
    } else {
      this.#db.insert(users).values({ address, privyDid: did, createdAt: this.#now() }).onConflictDoNothing().run();
    }
    // Baca ulang: kalau ada login paralel untuk DID yang sama, yang pertama tersimpan yang berlaku.
    const row = this.#db.select({ address: users.address }).from(users).where(eq(users.privyDid, did)).get();
    if (!row) throw unauthorized('Gagal mengikat akun Privy');
    return getAddress(row.address);
  }

  async #fetchEmbeddedWallet(did: string): Promise<Address> {
    const { appId, appSecret, apiUrl } = this.#cfg;
    let res: Response;
    try {
      res = await this.#fetch(`${apiUrl.replace(/\/$/, '')}/v1/users/${encodeURIComponent(did)}`, {
        headers: {
          'privy-app-id': appId,
          authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      throw new AppError(503, 'AUTH_PROVIDER_UNAVAILABLE', `Server Privy tidak bisa dihubungi: ${(err as Error).message}`);
    }
    if (res.status === 404) throw unauthorized('Akun Privy tidak ditemukan');
    if (!res.ok) throw new AppError(503, 'AUTH_PROVIDER_UNAVAILABLE', `Server Privy membalas ${res.status}`);
    const user = (await res.json()) as { linked_accounts?: LinkedAccount[] };
    const wallets = (user.linked_accounts ?? [])
      .filter((a) => a.type === 'wallet' && a.chain_type === 'ethereum' && (a.connector_type === 'embedded' || a.wallet_client_type === 'privy'))
      .filter((a) => typeof a.address === 'string' && isAddress(a.address, { strict: false }))
      .sort((a, b) => (a.wallet_index ?? 0) - (b.wallet_index ?? 0));
    const first = wallets[0];
    if (!first) throw new AppError(409, 'WALLET_NOT_READY', 'Embedded wallet Ethereum belum dibuat untuk akun ini');
    return getAddress(first.address!);
  }
}
