import { describe, expect, it } from 'vitest';
import { readTheme, saveTheme, themeStorageKey } from './theme';

describe('theme preference', () => {
  it('uses daylight by default, even when storage is unavailable or malformed', () => {
    expect(readTheme(null)).toBe('light');
    expect(readTheme({getItem:()=>null})).toBe('light');
    expect(readTheme({getItem:()=> 'system'})).toBe('light');
    expect(readTheme({getItem:()=>{throw Error('blocked');}})).toBe('light');
  });
  it('restores an explicitly saved light or dark choice using its own key', () => {
    for(const choice of ['light','dark'] as const) expect(readTheme({getItem:key=>key===themeStorageKey?choice:null})).toBe(choice);
  });
  it('persists the choice and tolerates blocked writes without preventing a theme change', () => {
    const writes: [string,string][]=[];
    saveTheme('dark',{setItem:(key,value)=>writes.push([key,value])});
    expect(writes).toEqual([[themeStorageKey,'dark']]);
    expect(()=>saveTheme('light',{setItem:()=>{throw Error('blocked');}})).not.toThrow();
    expect(()=>saveTheme('light',null)).not.toThrow();
  });
});
