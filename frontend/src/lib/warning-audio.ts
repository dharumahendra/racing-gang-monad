import type { HudWarning } from './hud';
export type AudioState='locked'|'ready'|'muted'|'blocked'|'unavailable';
type Voice={osc:OscillatorNode;gain:GainNode;warning:string};
export class WarningAudio {
  private context:AudioContext|null=null;private status:AudioState='locked';private muted=false;private generation=0;
  private seen=new Set<string>();private voices=new Set<Voice>();
  constructor(private factory=()=>new AudioContext()){}
  get state():AudioState{return this.muted?'muted':this.status==='ready'&&this.context?.state!=='running'?'blocked':this.status;}
  async unlock(){
    if(this.muted)return;
    const generation=this.generation;
    if(!this.context||this.context.state==='closed'){try{this.context=this.factory();}catch{this.status='unavailable';return;}}
    try{await this.context.resume();if(generation===this.generation)this.status=this.context?.state==='running'?'ready':'blocked';}
    catch{if(generation===this.generation)this.status='blocked';}
  }
  setMuted(muted:boolean){this.muted=muted;if(muted)this.silence();}
  update(warnings:readonly HudWarning[],playing:boolean,visible:boolean){
    if(!playing||!visible)this.silence();
    const pending=new Set(warnings.map(w=>`${w.id}:${w.activeTick}`));
    for(const voice of this.voices)if(!pending.has(voice.warning))this.stopVoice(voice);
    for(const warning of warnings){
      const key=`${warning.id}:${warning.activeTick}:${warning.seconds}`;if(this.seen.has(key))continue;this.seen.add(key);
      if(playing&&visible&&this.state==='ready')this.cue(warning);
    }
  }
  private cue(warning:HudWarning){
    const context=this.context;if(!context)return;
    const frequency={NITRO:660,SPIKES:440,RED:330}[warning.kind];
    // Two quiet, short tones per countdown second; no recording or external sound files.
    for(let i=0;i<2;i++){
      const duration=Math.min(.09,warning.remainingMs/1000-i*.12);if(duration<=.005)break;
      let voice:Voice|undefined;
      try{const osc=context.createOscillator();const gain=context.createGain();voice={osc,gain,warning:`${warning.id}:${warning.activeTick}`};this.voices.add(voice);const start=context.currentTime+i*.12;
        osc.type='sine';osc.frequency.setValueAtTime(frequency*(i?1.25:1),start);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.065,start+Math.min(.01,duration*.25));gain.gain.linearRampToValueAtTime(0,start+Math.min(.085,duration));
        osc.connect(gain);gain.connect(context.destination);const current=voice;osc.onended=()=>{osc.disconnect();gain.disconnect();this.voices.delete(current);};osc.start(start);osc.stop(start+duration);
      }catch{if(voice){try{voice.osc.stop();voice.osc.disconnect();voice.gain.disconnect();}catch{/* Audio cannot block the game. */}this.voices.delete(voice);}this.status='unavailable';break;}
    }
  }
  private stopVoice(voice:Voice){try{voice.osc.stop();}catch{/* Already ended. */}try{voice.osc.disconnect();voice.gain.disconnect();}catch{/* Already disconnected. */}this.voices.delete(voice);}
  silence(){for(const voice of this.voices)this.stopVoice(voice);}
  resetRun(){this.silence();this.seen.clear();}
  dispose(){this.generation++;this.resetRun();const context=this.context;this.context=null;this.status='locked';if(context&&context.state!=='closed')void context.close().catch(()=>{});}
}
