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
  })
  .superRefine((e, ctx) => {
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
