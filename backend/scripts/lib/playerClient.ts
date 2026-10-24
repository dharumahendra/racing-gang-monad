// Klien pemain tanpa UI: sim lokal + autopilot + protokol /ws/play (TECH_SPEC §4.1, §8.3).
// Dipakai test backend dan scripts/bot.ts. Tidak tergantung transport: kirim lewat `send`, terima lewat `handle`.
import { EntryKind, RUN_TICKS, encodeRedData, type EntryKind as Kind } from '@racing-gang/config';
import type { Hex, PlayC2S, PlayS2C } from '@racing-gang/config/protocol';
import { Sim, type LogEntry, type SimEvent } from '@racing-gang/sim';
import { Autopilot, type AutopilotOptions } from '@racing-gang/sim/dev';

type NearMissEvent = Extract<SimEvent, { type: 'NEAR_MISS' }>;
type Msg<T extends PlayS2C['t']> = Extract<PlayS2C, { t: T }>;

export class PlayerClient {
  readonly runId: Hex;
  readonly carTier: number;
  sim: Sim;
  startAt: number | null = null;
  result: Msg<'run.result'> | null = null;
  readonly localNearMisses: NearMissEvent[] = [];
  readonly verified: Msg<'nearMiss.verified'>[] = [];
  readonly recorded: Msg<'nearMiss.recorded'>[] = [];
  readonly qualified: Msg<'run.qualified'>[] = [];
  readonly scheduled: Msg<'disruption.scheduled'>[] = [];
  readonly errors: Msg<'error'>[] = [];
  readonly entries: LogEntry[] = [];

  #send: (m: PlayC2S) => void;
  #ap: Autopilot;
  #seq = 0;
  #decidedUpTo = 0;
  #inputs = new Map<number, LogEntry[]>();
  #spec = new Map<number, LogEntry[]>();
  #endSent = false;
  #acks = new Map<string, boolean>();

  constructor(p: { runId: Hex; seed: Hex; carTier: number; send: (m: PlayC2S) => void; autopilot?: AutopilotOptions }) {
    this.runId = p.runId;
    this.carTier = p.carTier;
    this.sim = new Sim({ runId: p.runId, seed: p.seed, carTier: p.carTier });
    this.#send = p.send;
    this.#ap = new Autopilot(p.autopilot);
  }

  ready() {
    this.#send({ t: 'run.ready', runId: this.runId });
  }

  handle(m: PlayS2C) {
    switch (m.t) {
      case 'run.go':
        if (m.seed && this.sim.tick === 0 && m.seed !== this.sim.seed) {
          this.sim = new Sim({ runId: this.runId, seed: m.seed, carTier: this.carTier });
        }
        this.startAt = m.startAt;
        return;
      case 'disruption.scheduled': {
        // Dikirim ulang saat reconnect kalau ack sebelumnya tidak sampai: jawab dengan keputusan yang sama.
        const prev = this.#acks.get(m.id);
        if (prev !== undefined) return this.#send({ t: 'disruption.ack', id: m.id, applied: prev });
        this.scheduled.push(m);
        // Diterima sebelum warnTick → masuk log di warnTick; kalau terlambat → applied=false.
        const applied = this.sim.tick < m.warnTick && !this.sim.ended;
        if (applied) {
          const kind = m.kind === 'NITRO' ? EntryKind.SPEC_NITRO : m.kind === 'SPIKES' ? EntryKind.SPEC_SPIKES : EntryKind.SPEC_RED;
          const data = m.kind === 'NITRO' ? 0 : m.kind === 'SPIKES' ? m.lanes[0]! : encodeRedData(m.lanes[0]!, m.durationIndex ?? 0);
          const list = this.#spec.get(m.warnTick) ?? [];
          list.push({ tick: m.warnTick, kind: kind as Kind, data, seq: list.length });
          this.#spec.set(m.warnTick, list);
        }
        this.#acks.set(m.id, applied);
        this.#send({ t: 'disruption.ack', id: m.id, applied });
        return;
      }
      // Server mengirim ulang semua status mepet saat tersambung ulang; simpan sekali per index.
      case 'nearMiss.verified':
        if (!this.verified.some((v) => v.index === m.index)) this.verified.push(m);
        return;
      case 'nearMiss.recorded':
        if (!this.recorded.some((r) => r.index === m.index)) this.recorded.push(m);
        return;
      case 'run.qualified': return void this.qualified.push(m);
      case 'run.result': this.result = m; return;
      case 'error': return void this.errors.push(m);
      default: return;
    }
  }

  /** Tick yang seharusnya sedang tampil menurut jam (server) `now`. */
  targetTick(now: number) {
    return this.startAt === null ? 0 : Math.max(0, Math.floor(((now - this.startAt) * 30) / 1000));
  }

  /** Majukan sim sampai `target`. Input untuk tick T dikirim sebelum tick T diproses. */
  advanceTo(target: number) {
    while (!this.sim.ended && this.sim.tick < Math.min(target, RUN_TICKS)) {
      const T = this.sim.tick + 1;
      if (this.#decidedUpTo < T) {
        this.#decidedUpTo = T;
        for (const kind of this.#ap.decide(this.sim.view(), this.carTier)) this.input(T, kind);
      }
      const list = [...(this.#spec.get(T) ?? []), ...(this.#inputs.get(T) ?? [])];
      this.entries.push(...list);
      for (const e of this.sim.step(list)) if (e.type === 'NEAR_MISS') this.localNearMisses.push(e);
    }
    if (this.sim.ended && !this.#endSent) {
      this.#endSent = true;
      this.#send({ t: 'run.end', tick: this.sim.tick, reason: this.sim.endReason!, nearMisses: this.sim.nearMisses, inputHash: this.sim.inputHash });
    }
  }

  /** Kirim input untuk tick tertentu (dipakai autopilot, juga test untuk kasus khusus). */
  input(tick: number, kind: Kind) {
    const seq = ++this.#seq;
    const list = this.#inputs.get(tick) ?? [];
    list.push({ tick, kind, data: 0, seq });
    this.#inputs.set(tick, list);
    this.#send({ t: 'input', tick, kind: kind as 1 | 2 | 3 | 4, seq });
  }

  watermark(tick = this.sim.tick) {
    this.#send({ t: 'watermark', tick });
  }

  snapshot() {
    const v = this.sim.view();
    this.#send({ t: 'snapshot', tick: v.tick, x: v.player.x, z: v.player.z, speed: v.player.speed, targetLane: v.player.targetLane, nearMisses: v.nearMisses });
  }
}
