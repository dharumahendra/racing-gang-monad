// Penjaga aturan §3.1: logika sim tidak boleh memakai sumber non-deterministik atau float.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const FORBIDDEN = [/Math\.random/, /Date\.now/, /performance\.now/, /new Date\(/, /parseFloat/, /Math\.(round|ceil|trunc|sqrt|pow)\(/];

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === 'dev' ? [] : files(p); // dev/ bukan logika game
    return p.endsWith('.ts') ? [p] : [];
  });

describe('determinisme', () => {
  it('src (kecuali dev/) bebas Math.random, Date.now, dan fungsi float', () => {
    const hits = files(src).flatMap((f) =>
      readFileSync(f, 'utf8').split('\n').flatMap((line, n) =>
        FORBIDDEN.some((re) => re.test(line.replace(/\/\/.*$/, ''))) ? [`${f}:${n + 1}: ${line.trim()}`] : [],
      ),
    );
    expect(hits).toEqual([]);
  });
});
