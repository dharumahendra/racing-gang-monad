import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from 'zustand';
import { ApiError } from '../lib/api';
import { createRoomApi, RoomMonitor, validRoomCode } from '../lib/room-api';
import { RunLaunch } from '../lib/run-launch';
import { settings } from '../lib/config';
import { session, useAuthRuntime } from '../lib/auth-runtime';

export function HostRoomPanel({apiUrl,code,getToken,onCode,enabled=true,canCreate=true}:{apiUrl:string;code:string|null;getToken:()=>Promise<string|null>;onCode:(code:string)=>void;enabled?:boolean;canCreate?:boolean}){
  const launch=useRef(new RunLaunch<{code:string;dispose:()=>void}>()).current;const mounted=useRef(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [uncertain,setUncertain]=useState(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;launch.invalidate();};},[launch]);
  useEffect(()=>{if(!enabled){launch.invalidate();setBusy(false);}},[enabled,launch]);
  async function create(){if(!enabled||!canCreate||launch.busy||uncertain)return;setBusy(true);setError('');try{const created=await launch.begin(getToken,async(token,signal)=>({...await createRoomApi(apiUrl).create(token,signal),dispose(){}}));if(mounted.current&&created)onCode(created.code);}catch(error){if(mounted.current){setError(error instanceof Error?error.message:'Could not create the room.');if(error instanceof ApiError&&['UNKNOWN_OUTCOME','INVALID_RESPONSE'].includes(error.code))setUncertain(true);}}finally{if(mounted.current)setBusy(launch.busy);}}
  if(code)return validRoomCode(code)?<RoomDetails apiUrl={apiUrl} code={code} enabled={enabled}/>:<p role="alert">Invalid room code.</p>;
  return <section className="info-panel"><button className="button" disabled={busy||uncertain||!enabled||!canCreate} onClick={()=>void create()}>{busy?'Creating room…':'Create room'}</button>{!canCreate&&<p>Game account is being set up.</p>}{error&&<p className="inline-error" role="alert">{error}</p>}</section>;
}
function RoomDetails({apiUrl,code,enabled}:{apiUrl:string;code:string;enabled:boolean}){
  const [monitor,setMonitor]=useState<RoomMonitor|null>(null);const [,render]=useState(0);const [copy,setCopy]=useState('');
  useEffect(()=>{if(!enabled){setMonitor(null);return;}const next=new RoomMonitor(code,createRoomApi(apiUrl));setMonitor(next);void next.poll();const timer=setInterval(()=>{if(document.visibilityState==='visible')void next.poll();},3000);const clock=setInterval(()=>render(n=>n+1),500);const focus=()=>void next.poll();window.addEventListener('focus',focus);return()=>{clearInterval(timer);clearInterval(clock);window.removeEventListener('focus',focus);next.dispose();};},[apiUrl,code,enabled]);
  const room=monitor?.room;const expires=room?Math.max(0,Math.ceil((room.expiresAt-Date.now())/1000)):null;const link=new URL(`/watch/${code}`,location.origin).href;
  async function copyLink(){try{await navigator.clipboard.writeText(link);setCopy('Link copied.');}catch{setCopy('Select and copy the link below manually.');}}
  return <section className="host-room" data-host-room={code}><div className="room-code-block"><span className="eyebrow">CODE FOR SPECTATORS</span><h2>{code}</h2><p>Enter this code on the Spectator page.</p></div><dl className="room-facts"><div><dt>Spectators</dt><dd>{room?room.spectators:'—'}</dd></div><div><dt>{monitor?.expired?'Room expired':'Room time left'}</dt><dd>{expires===null?'—':`${Math.floor(expires/60)}:${String(expires%60).padStart(2,'0')}`}</dd></div></dl><figure style={{margin:"1rem 0"}}><QRCodeSVG value={link} size={192} level="M" marginSize={4} bgColor="#ffffff" fgColor="#101216" title={"Join spectator room "+code}/><figcaption>Scan to spectate · no wallet needed.</figcaption></figure><label htmlFor="watch-link">Spectator link</label><input id="watch-link" readOnly value={link} onFocus={e=>e.currentTarget.select()}/><div className="host-actions"><button className="button secondary" onClick={()=>void copyLink()}>Copy link</button>{monitor?.canStart?<Link className="button" to={`/online?room=${code}`}>Start a run in this room</Link>:<button className="button" disabled>{room?.run?'Run in progress':monitor?.expired?'Room expired':'Waiting for room status'}</button>}</div>{copy&&<p role="status">{copy}</p>}
    <p role="status" data-room-monitor={monitor?.status||'disabled'}>{!enabled?'Game session not ready.':monitor?.expired&&room?.run?'Room expired. The active run continues; new interference is disabled.':room?.run?'There is an active run in this room. Do not create a second run.':monitor?.status==='ready'?'Room ready. Share the code and start a run.':'Checking room state…'}</p>{monitor?.error&&<p className="inline-error" role="alert">{monitor.error} The numbers shown are the last known state.</p>}<p className="fine-print">Spectator count updates periodically. Opening the host page is not counted as a spectator.</p></section>;
}
function HostAccount({code,onCode}:{code:string|null;onCode:(code:string)=>void}){
  const auth=useAuthRuntime();const game=useStore(session);return <HostRoomPanel apiUrl={settings.apiUrl} code={code} getToken={auth.getToken} onCode={onCode} enabled={!['signed_out','error'].includes(game.status)} canCreate={game.status==='ready'}/>;
}
export function Room(){
  const auth=useAuthRuntime();const [search,setSearch]=useSearchParams();const code=search.get('code');
  return <div className="narrow"><h1>Room</h1><p>Spectators join with a code, no login.</p>
    {settings.mode!=='live'||!settings.apiUrl||!auth.configured?<section className="info-panel"><p>Room service is not available yet.</p><button className="button" disabled>Create room · awaiting integration</button></section>:!auth.authenticated||!auth.address?<section className="info-panel"><p>Sign in with Google to create a room.</p></section>:<HostAccount key={`${auth.subject}:${auth.address}:${code}`} code={code} onCode={next=>setSearch({code:next},{replace:true})}/>}
    <Link className="quiet-link" to="/watch">Open the spectator page →</Link></div>;
}
