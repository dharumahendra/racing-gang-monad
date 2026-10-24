import { EntryKind } from '@racing-gang/config';
import { pointerDrivingHandlers, type HeldDrivingInputs, type HoldKind } from '../lib/driving-input';
const actions:{kind:HoldKind;label:string;symbol:string}[]=[
  {kind:EntryKind.LEFT,label:'Hold to steer left',symbol:'←'},
  {kind:EntryKind.BRAKE_ON,label:'Hold to brake',symbol:'Brake'},
  {kind:EntryKind.ACCEL_ON,label:'Hold to accelerate',symbol:'Gas'},
  {kind:EntryKind.RIGHT,label:'Hold to steer right',symbol:'→'},
];
export function DrivingControls({held,enabled}:{held:HeldDrivingInputs;enabled:boolean}) {
 return <div className="driving-controls" role="group" aria-label="Hold driving controls">
  {actions.map(a=><button key={a.kind} type="button" disabled={!enabled} aria-label={a.label}
   {...pointerDrivingHandlers(held,a.kind)}
   onContextMenu={e=>e.preventDefault()}
   onKeyDown={e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();if(!e.repeat)held.press('button:'+a.kind+':'+e.code,a.kind);}}}
   onKeyUp={e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();held.release('button:'+a.kind+':'+e.code);}}}
   onBlur={()=>{held.release('button:'+a.kind+':Space');held.release('button:'+a.kind+':Enter');}}>
    {a.symbol}<small>Hold</small>
  </button>)}
 </div>;
}
