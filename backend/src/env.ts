// Validasi variabel lingkungan (TECH_SPEC §10 + BACKEND_PLAN F1).
import { z } from 'zod';

const privateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'harus private key hex 32 byte');
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'harus alamat hex 20 byte');

const LIVE_REQUIRED = [
  'MONAD_RPC_URL',
  'MONAD_WS_URL',
  'ATTESTER_PRIVATE_KEY',
  'VOUCHER_SIGNER_PRIVATE_KEY',
  'RUN_REGISTRY_ADDRESS',
  'CAR_NFT_ADDRESS',
] as const;

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().default('./data/racing-gang.db'),
    JWT_SECRET: z.string().min(32, 'minimal 32 karakter'),
    /** Origin frontend; host-nya dipakai sebagai domain SIWE. */
    PUBLIC_ORIGIN: z.url(),
    /** Daftar origin dipisah koma. Kosong = hanya PUBLIC_ORIGIN. */
    CORS_ORIGIN: z.string().default(''),
    CHAIN_ID: z.coerce.number().int().positive(),
    CHAIN_MODE: z.enum(['mock', 'live']).default('mock'),
    SEED_SOURCE: z.enum(['local', 'event']).default('local'),
    MONAD_RPC_URL: z.url().optional(),
    MONAD_WS_URL: z.string().optional(),
    EXPLORER_URL: z.url().optional(),
    ATTESTER_PRIVATE_KEY: privateKey.optional(),
    VOUCHER_SIGNER_PRIVATE_KEY: privateKey.optional(),
    RUN_REGISTRY_ADDRESS: address.optional(),
    CAR_NFT_ADDRESS: address.optional(),
    /** Login utama: Privy + Google (PRD §4). App ID publik, sama dengan VITE_PRIVY_APP_ID di frontend. */
    PRIVY_APP_ID: z.string().min(1).optional(),
    /** Verification key (PEM, "-----BEGIN PUBLIC KEY-----") dari dashboard Privy; `\n` boleh ditulis literal. */
    PRIVY_VERIFICATION_KEY: z.string().min(1).optional(),
    /** Alternatif/tambahan PEM: URL JWKS publik Privy. Bila diisi, dipakai untuk verifikasi (mendukung rotasi kunci). */
    PRIVY_JWKS_URL: z.url().optional(),
    /** Rahasia server Privy untuk membaca embedded wallet pengguna. Jangan pernah dikirim ke frontend. */
    PRIVY_APP_SECRET: z.string().min(1).optional(),
    PRIVY_API_URL: z.url().default('https://api.privy.io'),
    /** Login SIWE langsung dengan wallet: untuk bot dan pengembangan. Matikan di production kecuali untuk uji bot. */
    ALLOW_SIWE_LOGIN: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    /** Khusus pengembangan: "0xAlamat:tier,..." dianggap memiliki mobil (lihat devGrants.ts). Hanya mock + non-production. */
    DEV_GRANT_TIERS: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    const privy = [e.PRIVY_APP_ID, e.PRIVY_VERIFICATION_KEY || e.PRIVY_JWKS_URL, e.PRIVY_APP_SECRET];
    if (privy.some(Boolean) && !privy.every(Boolean)) {
      for (const key of ['PRIVY_APP_ID', 'PRIVY_VERIFICATION_KEY', 'PRIVY_APP_SECRET'] as const) {
        if (!e[key] && !(key === 'PRIVY_VERIFICATION_KEY' && e.PRIVY_JWKS_URL)) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'konfigurasi Privy harus lengkap (APP_ID, VERIFICATION_KEY atau JWKS_URL, APP_SECRET)' });
        }
      }
    }
    if (e.NODE_ENV === 'production' && !e.PRIVY_APP_ID) {
      ctx.addIssue({ code: 'custom', path: ['PRIVY_APP_ID'], message: 'wajib di production: login utama memakai Privy' });
    }
    if (!e.PRIVY_APP_ID && !e.ALLOW_SIWE_LOGIN) {
      ctx.addIssue({ code: 'custom', path: ['PRIVY_APP_ID'], message: 'tidak ada metode login: isi konfigurasi Privy atau set ALLOW_SIWE_LOGIN=true' });
    }
    if (e.DEV_GRANT_TIERS && (e.CHAIN_MODE !== 'mock' || e.NODE_ENV === 'production')) {
      ctx.addIssue({ code: 'custom', path: ['DEV_GRANT_TIERS'], message: 'hanya boleh dengan CHAIN_MODE=mock di luar production' });
    }
    if (e.CHAIN_MODE !== 'live') return;
    for (const key of LIVE_REQUIRED) {
      if (!e[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'wajib diisi saat CHAIN_MODE=live' });
    }
  });

export type Env = z.infer<typeof schema>;

export function loadEnv(src: Record<string, string | undefined> = process.env): Env {
  // Nilai kosong di .env dianggap tidak diisi.
  const cleaned = Object.fromEntries(Object.entries(src).filter(([, v]) => v !== undefined && v !== ''));
  const r = schema.safeParse(cleaned);
  if (!r.success) throw new Error(`Env tidak valid:\n${z.prettifyError(r.error)}`);
  return r.data;
}

export const corsOrigins = (env: Env) =>
  [env.PUBLIC_ORIGIN, ...env.CORS_ORIGIN.split(',')].map((s) => s.trim()).filter(Boolean);
