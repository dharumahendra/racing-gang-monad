import { expect, it } from 'vitest';
import { EntryKind, COUNTDOWN_MS } from '@racing-gang/config';
import { replay } from '@racing-gang/sim';
import { LocalRunner } from './runner';
const params = { runId: `0x${'11'.repeat(32)}` as const, seed: `0x${'22'.repeat(32)}` as const, carTier: 0 };
it('does not consume game ticks during countdown', () => {
  const r = new LocalRunner(params); r.start(); r.advance(1500);
  expect(r.phase).toBe('countdown'); expect(r.current.tick).toBe(0); expect(r.countdownMs).toBe(1500);
});
it('assigns keyboard input to the next simulation tick and preserves held brake events', () => {
  const r = new LocalRunner(params); r.start(); r.advance(COUNTDOWN_MS); r.input(EntryKind.RIGHT); r.input(EntryKind.BRAKE_ON); r.advance(34);
  expect(r.current.tick).toBe(1); expect(r.current.player.targetLane).toBe(2); expect(r.current.player.braking).toBe(true);
  expect(r.log.map(e => [e.tick, e.kind, e.seq])).toEqual([[1,2,1],[1,3,2]]);
  r.input(EntryKind.BRAKE_OFF); r.advance(34); expect(r.current.player.braking).toBe(false);
});
it('produces identical state at different rendering frame rates', () => {
  const a = new LocalRunner(params); const b = new LocalRunner(params); a.start(); b.start();
  a.advance(COUNTDOWN_MS); b.advance(COUNTDOWN_MS);
  for (let i=0; i<60; i++) a.advance(1000/60);
  for (let i=0; i<144; i++) b.advance(1000/144);
  expect(a.current.tick).toBe(30); expect(b.current).toEqual(a.current);
});
it('stops stepping after ending and can replay its exact input log', () => {
  const r = new LocalRunner(params); r.start(); r.advance(COUNTDOWN_MS); r.input(EntryKind.LEFT); r.advance(100000);
  expect(r.phase).toBe('ended'); const tick = r.current.tick; r.advance(5000); r.input(EntryKind.RIGHT);
  expect(r.current.tick).toBe(tick);
  const result = replay({ ...params, entries:r.log }); expect(result.finalHash).toBe(r.sim.inputHash); expect(result.nearMisses).toBe(r.current.nearMisses);
});
