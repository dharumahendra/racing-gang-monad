// Suara mesin kontinu + efek mepet, disintesis WebAudio (tanpa file eksternal, tanpa lisensi aset).
// Terpisah dari WarningAudio agar nada peringatan tetap utuh; keduanya di-unlock/mute/dispose bersama lewat useWarningAudio.
// Hanya tampilan/umpan balik: tidak pernah menyentuh logika sim. Audio tidak boleh memblokir game — semua error ditelan.
export type EngineState = 'locked' | 'ready' | 'muted' | 'blocked' | 'unavailable';

type EngineNodes = { osc: OscillatorNode; sub: OscillatorNode; filter: BiquadFilterNode; gain: GainNode };

export class EngineAudio {
  private context: AudioContext | null = null;
  private status: EngineState = 'locked';
  private muted = false;
  private generation = 0;
  private nodes: EngineNodes | null = null;
  private pops = new Set<OscillatorNode>();
  private seen = new Set<number>();

  constructor(private factory = () => new AudioContext()) {}

  get state(): EngineState {
    return this.muted ? 'muted' : this.status === 'ready' && this.context?.state !== 'running' ? 'blocked' : this.status;
  }

  async unlock() {
    if (this.muted) return;
    const generation = this.generation;
    if (!this.context || this.context.state === 'closed') {
      try { this.context = this.factory(); } catch { this.status = 'unavailable'; return; }
    }
    try {
      await this.context.resume();
      if (generation === this.generation) this.status = this.context?.state === 'running' ? 'ready' : 'blocked';
    } catch { if (generation === this.generation) this.status = 'blocked'; }
  }

  setMuted(muted: boolean) { this.muted = muted; if (muted) this.silence(); }

  /**
   * Suara mesin: nada rendah yang pitch & volumenya naik mengikuti kecepatan (0..1 dari maxSpeed).
   * Loop dibuat saat pertama kali berbunyi dan diperbarui mulus; berhenti saat tidak playing/visible/mute.
   */
  engine(speed: number, maxSpeed: number, playing: boolean, visible: boolean) {
    const context = this.context;
    if (!playing || !visible || this.state !== 'ready' || !context) { this.silence(); return; }
    const ratio = maxSpeed > 0 ? Math.min(1, Math.max(0, speed / maxSpeed)) : 0;
    if (!this.nodes) {
      try {
        const osc = context.createOscillator();
        const sub = context.createOscillator();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        osc.type = 'sawtooth'; sub.type = 'sine';
        filter.type = 'lowpass'; filter.frequency.value = 900; filter.Q.value = 0.7;
        gain.gain.value = 0;
        osc.connect(filter); sub.connect(filter); filter.connect(gain); gain.connect(context.destination);
        osc.start(); sub.start();
        this.nodes = { osc, sub, filter, gain };
      } catch { this.status = 'unavailable'; this.silence(); return; }
    }
    try {
      const { osc, sub, filter, gain } = this.nodes;
      const t = context.currentTime;
      const base = 55 + ratio * 120;        // ~55–175 Hz: idle → high rev
      const ramp = 0.08;                     // transisi mulus, hindari zipper noise
      osc.frequency.setTargetAtTime(base, t, ramp);
      sub.frequency.setTargetAtTime(base / 2, t, ramp);
      filter.frequency.setTargetAtTime(500 + ratio * 1800, t, ramp);
      gain.gain.setTargetAtTime(0.015 + ratio * 0.05, t, ramp);
    } catch { this.status = 'unavailable'; this.silence(); }
  }

  /** Efek mepet singkat (whoosh) sekali per index near-miss. Dedup lewat `index`. */
  nearMiss(index: number, audible = true) {
    const context = this.context;
    if (this.seen.has(index)) return;
    this.seen.add(index);
    // Event senyap tetap dikonsumsi agar tidak menumpuk lalu berbunyi saat unmute/tab dibuka.
    if (!audible || this.state !== 'ready' || !context) return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const t = context.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.18);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(gain); gain.connect(context.destination);
      this.pops.add(osc);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); this.pops.delete(osc); };
      osc.start(t); osc.stop(t + 0.22);
    } catch { this.status = 'unavailable'; }
  }

  private stopEngine() {
    if (!this.nodes) return;
    const { osc, sub, filter, gain } = this.nodes;
    for (const node of [osc, sub]) { try { node.stop(); } catch { /* sudah berhenti */ } }
    for (const node of [osc, sub, filter, gain]) { try { node.disconnect(); } catch { /* sudah terputus */ } }
    this.nodes = null;
  }

  silence() {
    this.stopEngine();
    for (const osc of this.pops) { try { osc.stop(); } catch { /* sudah berhenti */ } try { osc.disconnect(); } catch { /* sudah terputus */ } }
    this.pops.clear();
  }

  resetRun() { this.silence(); this.seen.clear(); }

  dispose() {
    this.generation++;
    this.resetRun();
    const context = this.context;
    this.context = null;
    this.status = 'locked';
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }
}
