import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

/** Buka DB SQLite dan jalankan migrasi. `path` boleh ':memory:' untuk test. */
export function openDb(path: string): { db: Db; close: () => void } {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  // WAL + NORMAL: commit tidak fsync setiap kali (verifikasi menulis ±10 transaksi/dtk per pemain dan fsync
  // memblok event loop). Tetap aman dari proses mati mendadak; hanya listrik padam yang bisa menghilangkan
  // beberapa transaksi terakhir, dan DB tidak korup.
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, close: () => sqlite.close() };
}
