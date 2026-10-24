import { expect, it } from 'vitest';
import { runCheckpoint } from './run-checkpoint';
it('keeps a public run reference across reload without changing the source query or room',()=>{
  const original=new URLSearchParams('room=AB7K2M');const id=`0x${'11'.repeat(32)}`;const next=runCheckpoint(original,id);expect(original.has('run')).toBe(false);expect(next.get('room')).toBe('AB7K2M');expect([...next.keys()].sort()).toEqual(['room','run']);expect(new URLSearchParams(next.toString()).get('run')).toBe(id);
});
it('rejects incomplete IDs instead of manufacturing an unrelated recovery request',()=>{expect(()=>runCheckpoint(new URLSearchParams(),'demo')).toThrow();});
