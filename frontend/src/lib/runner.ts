import { Sim, type LogEntry, type SimView, type SimEvent } from '@racing-gang/sim';
import { COUNTDOWN_MS, TICK_RATE, type PlayerInputKind } from '@racing-gang/config';
export class LocalRunner {
  private _sim: Sim;
  current: SimView;
  previous: SimView;
  phase: 'idle' | 'countdown' | 'running' | 'ended' = 'idle';
  countdownMs = COUNTDOWN_MS;
  accumulator = 0;
  readonly log: LogEntry[] = [];
  readonly events:SimEvent[]=[];
  private seq = 0;
  private pending: LogEntry[] = [];
  private runningListeners = new Set<()=>void>();
  constructor(private readonly params: ConstructorParameters<typeof Sim>[0]) { this._sim = new Sim(params); this.current = this.sim.view(); this.previous = this.current; }
  get sim() { return this._sim; }
  setSeedBeforeStart(seed: ConstructorParameters<typeof Sim>[0]['seed']) {
    if(this.phase!=='idle')return false;
    this._sim=new Sim({...this.params,seed});this.current=this._sim.view();this.previous=this.current;return true;
  }
  start() { if(this.phase==='idle') this.phase='countdown'; }
  /** Notify controls synchronously at GO, before the first simulation tick. */
  onRunning(listener:()=>void) {
    this.runningListeners.add(listener);
    return ()=>{this.runningListeners.delete(listener);};
  }
  input(kind: PlayerInputKind) {
    if(this.phase!=='running')return null;
    const entry={tick:this.sim.tick+1,kind,data:0,seq:++this.seq};
    this.pending.push(entry);return entry;
  }
  schedule(entry:LogEntry) {
    if(entry.tick<=this.sim.tick||this.phase==='ended')return false;
    this.pending.push({...entry});return true;
  }
  advance(ms: number) {
    if(!Number.isFinite(ms)||ms<0||this.phase==='idle'||this.phase==='ended')return;
    if(this.phase==='countdown') {
      const used=Math.min(ms,this.countdownMs); this.countdownMs-=used; ms-=used;
      if(this.countdownMs>0)return; this.phase='running';
      for(const listener of this.runningListeners)listener();
    }
    this.accumulator+=ms;
    const step=1000/TICK_RATE;
    while(this.accumulator+1e-7>=step&&!this.sim.ended) {
      const nextTick=this.sim.tick+1;
      const entries=this.pending.filter(e=>e.tick===nextTick); this.pending=this.pending.filter(e=>e.tick>nextTick);
      this.previous=this.current; this.events.push(...this.sim.step(entries)); this.log.push(...entries); this.current=this.sim.view();
      this.accumulator=Math.max(0,this.accumulator-step);
    }
    if(this.sim.ended){this.phase='ended';this.pending=[];this.accumulator=0;}
  }
  get alpha() { return this.phase==='ended'?1:Math.min(1,this.accumulator / (1000 / TICK_RATE)); }
}
