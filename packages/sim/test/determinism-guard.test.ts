// Penjaga aturan §3.1: logika sim tidak boleh memakai sumber non-deterministik atau float.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const FORBIDDEN = [/Math\.random/, /Date\.now/, /performance\.now/, /new Date\(/, /parseFloat/, /Math\.(round|ceil|trunc|sqrt|pow)\(/];
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const path = join(dir, f);
  if (statSync(path).isDirectory()) return f === 'dev' ? [] : files(path);
  return path.endsWith('.ts') ? [path] : [];
});
function violations(source: string) {
  return source.split(/\r?\n/).flatMap((line, index) => FORBIDDEN.some(re => re.test(line.replace(/\/\/.*$/, ''))) ? [{ line: index + 1, text: line.trim() }] : []);
}
describe('determinisme', () => {
  it.each(['\n', '\r\n'])('mengabaikan komentar tetapi tetap menolak kode nondeterministik dengan newline %j', newline => {
    const source = ['// Math.random/Date.now dilarang.', 'const sample = Math.random();', 'const safe = 1; // Date.now()', ''].join(newline);
    expect(violations(source)).toEqual([{ line: 2, text: 'const sample = Math.random();' }]);
  });
  it('src (kecuali dev/) bebas Math.random, Date.now, dan fungsi float', () => {
    const hits = files(src).flatMap(file => violations(readFileSync(file, 'utf8')).map(hit => `${file}:${hit.line}: ${hit.text}`));
    expect(hits).toEqual([]);
  });
});
