// Jalankan backend sebagai proses anak untuk uji crash dan beban (WORST_CASE_TESTS.md).
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export type ServerProc = { url: string; proc: ChildProcess; logs: string[]; kill: () => Promise<void>; stop: () => Promise<void> };

export async function startServer(opts: { port: number; dbPath: string; env?: Record<string, string> }): Promise<ServerProc> {
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'warn',
    HOST: '127.0.0.1',
    PORT: String(opts.port),
    DATABASE_URL: opts.dbPath,
    JWT_SECRET: 'stress-secret-stress-secret-stress-secret',
    PUBLIC_ORIGIN: 'http://localhost:5173',
    CHAIN_ID: '10143',
    CHAIN_MODE: 'mock',
    ALLOW_SIWE_LOGIN: 'true',
    ...opts.env,
  };
  const proc = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: BACKEND, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const logs: string[] = [];
  proc.stdout!.on('data', (d) => logs.push(String(d)));
  proc.stderr!.on('data', (d) => logs.push(String(d)));
  const url = `http://127.0.0.1:${opts.port}`;

  for (let i = 0; ; i++) {
    if (proc.exitCode !== null) throw new Error(`server berhenti saat start:\n${logs.join('')}`);
    try {
      if ((await fetch(`${url}/health`)).ok) break;
    } catch {
      // belum siap
    }
    if (i > 300) throw new Error('server tidak siap dalam 30 dtk');
    await new Promise((r) => setTimeout(r, 100));
  }

  const exited = () => new Promise<void>((r) => (proc.exitCode !== null ? r() : proc.once('exit', () => r())));
  return {
    url, proc, logs,
    // Windows: kill() = TerminateProcess, setara kill -9 (tanpa shutdown rapi).
    kill: async () => { proc.kill('SIGKILL'); await exited(); },
    stop: async () => { proc.kill('SIGTERM'); await exited(); },
  };
}

/** Jalankan script backend lain (mis. bot) sebagai proses anak; teruskan output dengan prefix. */
export function runScript(script: string, args: string[], prefix: string, onLine?: (line: string) => void) {
  const proc = spawn(process.execPath, ['--import', 'tsx', script, ...args], { cwd: BACKEND, stdio: ['ignore', 'pipe', 'pipe'] });
  const lines: string[] = [];
  const onData = (d: Buffer) => {
    for (const line of String(d).split(/\r?\n/).filter(Boolean)) {
      lines.push(line);
      onLine?.(line);
      if (prefix) console.log(`${prefix} ${line}`);
    }
  };
  proc.stdout!.on('data', onData);
  proc.stderr!.on('data', onData);
  const done = new Promise<number>((r) => proc.once('exit', (code) => r(code ?? 1)));
  return { proc, lines, done };
}
