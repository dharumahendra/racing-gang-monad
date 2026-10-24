import { describe, expect, it } from 'vitest';
import {
  BRAKE_DECEL,
  CARS,
  COAST,
  EntryKind,
  MIN_SPEED,
  NEAR_MISS_MIN_SPEED,
  PLAYER_START_SPEED,
  PLAYER_X_MAX,
  PLAYER_X_MIN,
  RUN_TICKS,
  TRAFFIC,
  VEHICLE,
  laneCenter,
  toKmh,
} from '@racing-gang/config';
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

  it('kendaraan yang menyalip pemain tidak dihitung; baru dihitung saat pemain menyalipnya balik', () => {
    const t = newTrack();
    const px = laneCenter(1);
    let hits = 0;
    // Kendaraan muncul di belakang, menyalip rapat (jarak pusat 350), lalu jauh di depan.
    for (let vz = 7000; vz < 13000; vz += 100) if (updateTrack(t, px, 10000, 167, 2, vz, 180, 450)) hits++;
    expect(hits).toBe(0);
    expect(t.resolved).toBe(false);
    // Lalu pemain menyalipnya balik: dihitung sekali.
    for (let pz = 8000; pz < 16000; pz += 150) if (updateTrack(t, px, pz, 167, 2, 13000, 180, 450)) hits++;
    expect(hits).toBe(1);
    expect(t.resolved).toBe(true);
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
    const reach = VEHICLE.TRUCK.l / 2;
    for (const { views } of [drive({ i: 1, carTier: 0 }), drive({ i: 1, carTier: 0, maxTick: 600, autopilot: { noGas: true } })]) {
      for (let T = 1; T < views.length; T++) {
        const v = views[T]!;
        const pRear = v.player.z - 225;
        const prevIds = new Set(views[T - 1]!.vehicles.map((x) => x.id));
        for (const veh of v.vehicles) {
          expect(veh.z + reach).toBeGreaterThanOrEqual(pRear - TRAFFIC.despawnBehind);
          expect(veh.z - reach).toBeLessThanOrEqual(v.player.z + TRAFFIC.despawnAhead);
          // tick 1 mengisi jalan; setelah itu kendaraan baru muncul jauh di depan, atau jauh di belakang (menyusul)
          if (T >= 2 && !prevIds.has(veh.id)) {
            const farAhead = veh.z - veh.l / 2 > v.player.z + 10000;
            const farBehind = veh.z + veh.l / 2 < pRear - 4000;
            expect(farAhead || farBehind).toBe(true);
          }
        }
      }
    }
  });

  it('kecepatan: mulai 40 km/j, gas sampai maxSpeed, rem turun 2/tick sampai MIN_SPEED', () => {
    expect(toKmh(PLAYER_START_SPEED)).toBe(40);
    const r = findRun(
      (i) => drive({ i, carTier: 0, autopilot: { noBrake: true }, maxTick: 260, inject: (T) => (T === 201 ? [{ kind: EntryKind.BRAKE_ON, data: 0 }] : []) }),
      (r) => r.sim.tick === 260 && !r.sim.ended,
    );
    const max = CARS[0].maxSpeed;
    expect(r.views[0]!.player.speed).toBe(PLAYER_START_SPEED);
    expect(r.views[1]!.player.speed).toBe(PLAYER_START_SPEED + CARS[0].accel); // gas ditekan sejak tick 1
    expect(r.views[max - PLAYER_START_SPEED]!.player.speed).toBe(max);
    expect(r.views[200]!.player.speed).toBe(max);
    expect(r.views[201]!.player.speed).toBe(max - BRAKE_DECEL); // rem menang atas gas yang masih ditahan
    expect(r.views[260]!.player.speed).toBe(MIN_SPEED);
  });

  it('gas dilepas: turun 1 cm/tick tiap 2 tick sampai MIN_SPEED', () => {
    const sim = new Sim({ runId: hex('r'), seed: hex('s'), carTier: 0 });
    const step = (...kinds: EntryKind[]) => sim.step(kinds.map((kind, i) => ({ tick: sim.tick + 1, kind, data: 0, seq: sim.tick * 10 + i + 1 })));
    step(EntryKind.ACCEL_ON);
    for (let i = 0; i < 39; i++) step();
    expect(sim.view().player).toMatchObject({ speed: PLAYER_START_SPEED + 40, accelerating: true });
    step(EntryKind.ACCEL_OFF); // tick 41: ganjil, belum turun
    expect(sim.view().player.speed).toBe(PLAYER_START_SPEED + 40);
    step(); // tick 42
    expect(sim.view().player.speed).toBe(PLAYER_START_SPEED + 40 - COAST.decel);
    for (let i = 0; i < 100 && !sim.ended; i++) step();
    if (!sim.ended) expect(sim.view().player.speed).toBe(MIN_SPEED);
  });

  it('tanpa gas, lalu lintas dari belakang menyusul pemain; mepet hanya saat pemain ≥ 100 km/j (mis. nitro NPC)', () => {
    let overtaken = 0;
    for (let i = 0; i < 10; i++) {
      const { views, events } = drive({ i, carTier: 0, maxTick: 900, autopilot: { noGas: true } });
      const back = new Set<number>();
      for (const v of views) for (const veh of v.vehicles) if (veh.id >= TRAFFIC.backIdBase && veh.z - veh.l / 2 > v.player.z + 225) back.add(veh.id);
      overtaken += back.size;
      for (const e of events) if (e.type === 'NEAR_MISS') expect(views[e.tick]!.player.speed).toBeGreaterThanOrEqual(NEAR_MISS_MIN_SPEED);
    }
    expect(overtaken).toBeGreaterThan(0);
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
