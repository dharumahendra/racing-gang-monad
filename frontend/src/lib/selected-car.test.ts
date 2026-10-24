import { describe, expect, it } from 'vitest';
import { readSelectedTier, resolveSelectedTier, saveSelectedTier } from './selected-car';

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };
const A = '0xF1359B00178B8cC52Dc4950ad75Fa0f57D535D30', B = '0x2222222222222222222222222222222222222222';

describe('selected car', () => {
  it('only resolves to a tier the account owns; anything else falls back to Starter', () => {
    expect(resolveSelectedTier('1', [1])).toBe(1);
    expect(resolveSelectedTier('3', [1])).toBe(0);
    expect(resolveSelectedTier('9', [1])).toBe(0);
    expect(resolveSelectedTier('abc', [1])).toBe(0);
    expect(resolveSelectedTier('1', undefined)).toBe(0);
  });
  it('is stored per account: account B does not inherit account A choice, signed-out is Starter', () => {
    const s = memory();
    saveSelectedTier(A, 1, s);
    expect(readSelectedTier(A, [1], s)).toBe(1);
    expect(readSelectedTier(A.toLowerCase(), [1], s)).toBe(1);
    expect(readSelectedTier(B, [1], s)).toBe(0);
    expect(readSelectedTier(undefined, [1], s)).toBe(0);
  });
  it('drops a stored choice once ownership is gone and survives a blocked storage', () => {
    const s = memory();
    saveSelectedTier(A, 1, s);
    expect(readSelectedTier(A, [], s)).toBe(0);
    const blocked = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
    expect(readSelectedTier(A, [1], blocked)).toBe(0);
    expect(() => saveSelectedTier(A, 1, blocked)).not.toThrow();
  });
});
