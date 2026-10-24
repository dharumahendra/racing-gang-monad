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
  async function create(){if(!enabled||!canCreate||launch.busy||uncertain)return;setBusy(true);setError('');try{const created=await launch.begin(getToken,async(token,signal)=>({...await createRoomApi(apiUrl).create(token,signal),dispose(){}}));if(mounted.current&&created)onCode(created.code);}catch(error){if(mounted.current){setError(error instanceof Error?error.message:'Room belum dapat dibuat.');if(error instanceof ApiError&&['UNKNOWN_OUTCOME','INVALID_RESPONSE'].includes(error.code))setUncertain(true);}}finally{if(mounted.current)setBusy(launch.busy);}}
  if(code)return validRoomCode(code)?<RoomDetails apiUrl={apiUrl} code={code} enabled={enabled}/>:<p role="alert">Kode room tidak valid.</p>;
  return <section className="info-panel"><h2>Room belum dibuat</h2><p>Buat room untuk membagikan kode ke penonton. Mereka dapat masuk dari HP tanpa login.</p><button className="button" disabled={busy||uncertain||!enabled||!canCreate} onClick={()=>void create()}>{busy?'Membuat room…':'Buat room'}</button>{!canCreate&&<p>Akun game sedang disiapkan.</p>}{error&&<p className="inline-error" role="alert">{error}</p>}</section>;
}
function RoomDetails({apiUrl,code,enabled}:{apiUrl:string;code:string;enabled:boolean}){
  const [monitor,setMonitor]=useState<RoomMonitor|null>(null);const [,render]=useState(0);const [copy,setCopy]=useState('');
  useEffect(()=>{if(!enabled){setMonitor(null);return;}const next=new RoomMonitor(code,createRoomApi(apiUrl));setMonitor(next);void next.poll();const timer=setInterval(()=>{if(document.visibilityState==='visible')void next.poll();},3000);const clock=setInterval(()=>render(n=>n+1),500);const focus=()=>void next.poll();window.addEventListener('focus',focus);return()=>{clearInterval(timer);clearInterval(clock);window.removeEventListener('focus',focus);next.dispose();};},[apiUrl,code,enabled]);
  const room=monitor?.room;const expires=room?Math.max(0,Math.ceil((room.expiresAt-Date.now())/1000)):null;const link=new URL(`/watch/${code}`,location.origin).href;
  async function copyLink(){try{await navigator.clipboard.writeText(link);setCopy('Tautan tersalin.');}catch{setCopy('Pilih dan salin tautan di bawah secara manual.');}}
  return <section className="host-room" data-host-room={code}><div className="room-code-block"><span className="eyebrow">KODE UNTUK PENONTON</span><h2>{code}</h2><p>Masukkan kode ini di halaman Penonton.</p></div><dl className="room-facts"><div><dt>Penonton</dt><dd>{room?room.spectators:'—'}</dd></div><div><dt>{monitor?.expired?'Room kedaluwarsa':'Sisa waktu room'}</dt><dd>{expires===null?'—':`${Math.floor(expires/60)}:${String(expires%60).padStart(2,'0')}`}</dd></div></dl><label htmlFor="watch-link">Tautan penonton</label><input id="watch-link" readOnly value={link} onFocus={e=>e.currentTarget.select()}/><div className="host-actions"><button className="button secondary" onClick={()=>void copyLink()}>Salin tautan</button>{monitor?.canStart?<Link className="button" to={`/online?room=${code}`}>Mulai run di room ini</Link>:<button className="button" disabled>{room?.run?'Run sedang berlangsung':monitor?.expired?'Room kedaluwarsa':'Menunggu status room'}</button>}</div>{copy&&<p role="status">{copy}</p>}
    <p role="status" data-room-monitor={monitor?.status||'disabled'}>{!enabled?'Sesi game belum siap.':monitor?.expired&&room?.run?'Room kedaluwarsa. Run aktif tetap berlangsung; gangguan baru dinonaktifkan.':room?.run?'Ada run aktif di room ini. Jangan membuat run kedua.':monitor?.status==='ready'?'Room siap. Bagikan kode lalu mulai run.':'Memeriksa keadaan room…'}</p>{monitor?.error&&<p className="inline-error" role="alert">{monitor.error} Angka yang terlihat adalah keadaan terakhir.</p>}<p className="fine-print">Jumlah penonton diperbarui berkala. Membuka halaman host tidak dihitung sebagai penonton.</p></section>;
}
function HostAccount({code,onCode}:{code:string|null;onCode:(code:string)=>void}){
  const auth=useAuthRuntime();const game=useStore(session);return <HostRoomPanel apiUrl={settings.apiUrl} code={code} getToken={auth.getToken} onCode={onCode} enabled={!['signed_out','error'].includes(game.status)} canCreate={game.status==='ready'}/>;
}
export function Room(){
  const auth=useAuthRuntime();const [search,setSearch]=useSearchParams();const code=search.get('code');
  return <div className="narrow"><span className="eyebrow">ROOM / HOST</span><h1>Ajak penontonmu.</h1><p>Bagikan kode room agar temanmu bisa mengirim gangguan dari HP tanpa wallet.</p>
    {settings.mode!=='live'||!settings.apiUrl||!auth.configured?<section className="info-panel"><h2>Room belum dibuat</h2><p>Layanan room sedang disiapkan. Belum ada kode atau room nyata yang dibuat.</p><button className="button" disabled>Buat room · menunggu integrasi</button></section>:!auth.authenticated||!auth.address?<section className="info-panel"><h2>Masuk untuk membuat room.</h2><p>Gunakan tombol Google di atas. Penontonmu tetap bisa bergabung tanpa login.</p></section>:<HostAccount key={`${auth.subject}:${auth.address}:${code}`} code={code} onCode={next=>setSearch({code:next},{replace:true})}/>}
    <Link className="quiet-link" to="/watch">Buka halaman penonton →</Link></div>;
}
