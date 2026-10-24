import { describe, expect, it } from 'vitest';
import { CARS, EntryKind, PLAYER_X_MAX, PLAYER_X_MIN, RUN_TICKS, VEHICLE, laneCenter } from '@racing-gang/config';
import { playRun } from '../src/dev/index';
import { appendHash, initialHash } from '../src/hash';
import { newTrack, updateTrack } from '../src/nearMiss';
import { replay } from '../src/replay';
import { Sim } from '../src/sim';
import type { LogEntry } from '../src/types';
import { drive, findRun, hex } from './helpers';

/** Pemain menyalip kendaraan diam di z=10000 dengan langkah 150 cm/tick. */
function passBy(px: number, vLane: number, dim: { w: number; l: number }, speed: number) {
  const t = newTrack();
  let hits = 0;
  for (let pz = 8000; pz < 13000; pz += 150) if (updateTrack(t, px, pz, speed, vLane, 10000, dim.w, dim.l)) hits++;
  return { hits, track: t };
}

describe('algoritma mepet (§3.6)', () => {
  it('menyalip dari lajur sebelah → terhitung (gap mobil 170, truk 135)', () => {
    const car = passBy(laneCenter(1), 2, VEHICLE.CAR, 167);
    expect(car.hits).toBe(1);
    expect(car.track.minGap).toBe(170);
    const truck = passBy(laneCenter(1), 2, VEHICLE.TRUCK, 167);
    expect(truck.hits).toBe(1);
    expect(truck.track.minGap).toBe(135);
  });

  it('dua lajur jauhnya → tidak', () => {
    expect(passBy(laneCenter(0), 2, VEHICLE.CAR, 167).hits).toBe(0);
  });

  it('kecepatan di bawah 93 saat selesai menyalip → tidak; 93 → ya', () => {
    expect(passBy(laneCenter(1), 2, VEHICLE.CAR, 92).hits).toBe(0);
    expect(passBy(laneCenter(1), 2, VEHICLE.CAR, 93).hits).toBe(1);
  });

  it('di tengah pindah lajur tetap dihitung kalau gap ≤ 180', () => {
    expect(passBy(laneCenter(2) - 360, 2, VEHICLE.CAR, 167).hits).toBe(1);
    expect(passBy(laneCenter(2) - 361, 2, VEHICLE.CAR, 167).hits).toBe(0);
  });

  it('kendaraan yang sudah resolved tidak dihitung lagi', () => {
    const { track } = passBy(laneCenter(1), 2, VEHICLE.CAR, 167);
    expect(track.resolved).toBe(true);
    expect(updateTrack(track, laneCenter(1), 20000, 167, 2, 10000, 180, 450)).toBe(false);
  });
});

describe('Sim', () => {
  it('menolak parameter dan entri tidak valid', () => {
    expect(() => new Sim({ runId: '0x1', seed: hex('s'), carTier: 0 })).toThrow();
    expect(() => new Sim({ runId: hex('r'), seed: hex('s'), carTier: 9 })).toThrow();
    const sim = new Sim({ runId: hex('r'), seed: hex('s'), carTier: 0 });
    expect(() => sim.step([{ tick: 2, kind: EntryKind.LEFT, data: 0, seq: 1 }])).toThrow();
  });

  describe('setir tahan (CONFIG_VERSION 2)', () => {
    const lat = CARS[0].lateral;
    const input = (sim: Sim, ...kinds: EntryKind[]) =>
      sim.step(kinds.map((kind, i) => ({ tick: sim.tick + 1, kind, data: 0, seq: sim.tick * 10 + i + 1 })));

    it('bergeser selama ditahan dan berhenti di tengah garis saat dilepas', () => {
      const sim = new Sim({ runId: hex('r'), seed: hex('s'), carTier: 0 });
      input(sim, EntryKind.RIGHT);
      expect(sim.view().player).toMatchObject({ x: laneCenter(1) + lat, steer: 1, targetLane: 2 });
      for (let i = 0; i < 5; i++) input(sim);
      expect(sim.view().player.x).toBe(laneCenter(1) + 6 * lat);
      input(sim, EntryKind.RIGHT_OFF);
      const x = sim.view().player.x;
      expect(x).toBe(laneCenter(1) + 6 * lat); // tick pelepasan tidak bergeser
      for (let i = 0; i < 10; i++) input(sim);
      expect(sim.view().player).toMatchObject({ x, steer: 0 });
      expect(x).toBeGreaterThan(laneCenter(1));
      expect(x).toBeLessThan(laneCenter(2));
    });

    it('dibatasi pusat lajur paling kiri dan paling kanan', () => {
      const sim = new Sim({ runId: hex('r'), seed: hex('s'), carTier: 0 });
      input(sim, EntryKind.LEFT);
      for (let i = 0; i < 13; i++) input(sim); // 350 cm butuh 12 tick; sisanya tertahan di batas
      expect(sim.view().player).toMatchObject({ x: PLAYER_X_MIN, targetLane: 0 });
      input(sim, EntryKind.LEFT_OFF, EntryKind.RIGHT);
      for (let i = 0; i < 36; i++) input(sim); // 1050 cm butuh 35 tick
      expect(sim.view().player).toMatchObject({ x: PLAYER_X_MAX, targetLane: 3 });
    });

    it('dua tombol: yang terakhir ditekan menang; melepasnya kembali ke tombol yang masih ditahan', () => {
      const sim = new Sim({ runId: hex('r'), seed: hex('s'), carTier: 0 });
      input(sim, EntryKind.LEFT);
      input(sim, EntryKind.RIGHT);
      expect(sim.view().player.steer).toBe(1);
      input(sim, EntryKind.LEFT_OFF); // bukan arah aktif: tetap kanan
      expect(sim.view().player.steer).toBe(1);
      input(sim, EntryKind.LEFT);
      input(sim, EntryKind.LEFT_OFF); // kembali ke kanan yang masih ditahan
      expect(sim.view().player.steer).toBe(1);
      input(sim, EntryKind.RIGHT_OFF);
      expect(sim.view().player.steer).toBe(0);
      input(sim, EntryKind.RIGHT_OFF, EntryKind.LEFT_OFF); // lepas tanpa tekan: tidak berefek
      expect(sim.view().player.steer).toBe(0);
    });

    it('tekan berulang (auto-repeat keyboard) tidak mempercepat geseran', () => {
      const a = new Sim({ runId: hex('r'), seed: hex('s'), carTier: 0 });
      const b = new Sim({ runId: hex('r'), seed: hex('s'), carTier: 0 });
      input(a, EntryKind.RIGHT);
      input(b, EntryKind.RIGHT);
      for (let i = 0; i < 5; i++) { input(a); input(b, EntryKind.RIGHT, EntryKind.RIGHT); }
      expect(b.view().player.x).toBe(a.view().player.x);
    });
  });

  it('hash chain: SPEC dulu lalu input, tidak tergantung urutan array', () => {
    const runId = hex('r'), seed = hex('s');
    const entries: LogEntry[] = [
      { tick: 1, kind: EntryKind.LEFT, data: 0, seq: 2 },
      { tick: 1, kind: EntryKind.SPEC_NITRO, data: 0, seq: 1 },
      { tick: 1, kind: EntryKind.BRAKE_ON, data: 0, seq: 1 },
    ];
    const a = new Sim({ runId, seed, carTier: 0 });
    const b = new Sim({ runId, seed, carTier: 0 });
    a.step(entries);
    b.step([...entries].reverse());
    let h = initialHash(runId, seed);
    h = appendHash(h, { tick: 1, kind: EntryKind.SPEC_NITRO, data: 0 });
    h = appendHash(h, { tick: 1, kind: EntryKind.BRAKE_ON, data: 0 });
    h = appendHash(h, { tick: 1, kind: EntryKind.LEFT, data: 0 });
    expect(a.inputHash).toBe(h);
    expect(b.inputHash).toBe(h);
  });

  it('inputHash mepet = hash setelah semua entri dengan tick ≤ tick mepet (§3.8)', () => {
    for (let i = 0; i < 5; i++) {
      const run = playRun({ runId: hex(`run-${i}`), seed: hex(`seed-${i}`), carTier: i % 3 });
      const nm = run.events.filter((e) => e.type === 'NEAR_MISS');
      for (const e of nm.slice(0, 10)) {
        const partial = replay({ runId: run.runId, seed: run.seed, carTier: run.carTier, entries: run.entries, endTick: e.tick });
        expect(e.inputHash).toBe(partial.finalHash);
      }
    }
  });

  it('mepet: index berurutan dan koin sesuai jenis', () => {
    for (let i = 0; i < 10; i++) {
      const { events, views, sim } = drive({ i, carTier: i % 3 });
      const nm = events.filter((e) => e.type === 'NEAR_MISS');
      expect(nm.length).toBeGreaterThan(0);
      nm.forEach((e, k) => {
        expect(e.index).toBe(k + 1);
        expect(e.coins).toBe(e.vehicleType === 1 ? 200 : 100);
      });
      expect(views.at(-1)!.coins).toBe(nm.reduce((s, e) => s + e.coins, 0));
      expect(sim.nearMisses).toBe(nm.length);

      const crash = events.find((e) => e.type === 'CRASH');
      if (crash) {
        expect(events.some((e) => e.type === 'NEAR_MISS' && e.tick === crash.tick)).toBe(false);
        expect(() => sim.step([])).toThrow();
      }
    }
  });

  it('lalu lintas tidak pernah muncul di dekat pemain dan dihapus setelah jauh di belakang', () => {
    const { views } = drive({ i: 1, carTier: 0 });
    for (let T = 1; T < views.length; T++) {
      const v = views[T]!;
      const prevIds = new Set(views[T - 1]!.vehicles.map((x) => x.id));
      for (const veh of v.vehicles) {
        expect(veh.z + veh.l / 2).toBeGreaterThanOrEqual(v.player.z - 225 - 2000);
        // tick 1 mengisi jalan dari baris pertama (30 m); setelah itu kendaraan baru muncul jauh di depan
        if (T >= 2 && !prevIds.has(veh.id)) expect(veh.z - veh.l / 2).toBeGreaterThan(v.player.z + 10000);
      }
    }
  });

  it('akselerasi sampai maxSpeed; rem berhenti di MIN_SPEED', () => {
    const r = findRun(
      (i) => drive({ i, carTier: 0, autopilot: { noBrake: true }, maxTick: 260, inject: (T) => (T === 201 ? [{ kind: EntryKind.BRAKE_ON, data: 0 }] : []) }),
      (r) => r.sim.tick === 260 && !r.sim.ended,
    );
    expect(r.views[200]!.player.speed).toBe(CARS[0].maxSpeed);
    expect(r.views[201]!.player.speed).toBe(CARS[0].maxSpeed - 4);
    expect(r.views[260]!.player.speed).toBe(80);
  });

  it('TIME_UP tepat di tick 3000', () => {
    const r = findRun((i) => drive({ i, carTier: 0 }), (r) => r.sim.endReason === 'TIME_UP');
    expect(r.sim.tick).toBe(RUN_TICKS);
    expect(r.events.at(-1)).toEqual({ type: 'TIME_UP', tick: RUN_TICKS });
  });

  it('replay log menghasilkan event yang identik dengan run live', () => {
    for (let i = 0; i < 8; i++) {
      const live = playRun({
        runId: hex(`run-${i}`),
        seed: hex(`seed-${i}`),
        carTier: i % 3,
        spec: (T) => (T % 211 === 0 ? [{ kind: EntryKind.SPEC_SPIKES, data: T % 4 }] : []),
      });
      const r = replay({ runId: live.runId, seed: live.seed, carTier: live.carTier, entries: live.entries });
      expect(r.events).toEqual(live.events);
      expect(r.finalHash).toBe(live.finalHash);
      expect(r.endTick).toBe(live.endTick);
      expect(r.nearMisses).toBe(live.nearMisses);
    }
  });

  it('replay PARTIAL berhenti di endTick tanpa menyelesaikan sim', () => {
    const r = replay({ runId: hex('r'), seed: hex('s'), carTier: 0, entries: [], endTick: 20 });
    expect(r.endTick).toBe(20);
    expect(r.ended).toBe(false);
    expect(r.endReason).toBeNull();
  });
});
