import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from 'zustand';
import { CARS, type PlayerInputKind } from '@racing-gang/config';
import { RaceScene } from '../components/RaceScene';
import { PlayClient } from '../lib/play-client';
import { createRunApi } from '../lib/run-api';
import { ApiError } from '../lib/api';
import { settings } from '../lib/config';
import { session, useAuthRuntime } from '../lib/auth-runtime';
import { useDrivingControls } from '../lib/use-driving-controls';
import { RunLaunch } from '../lib/run-launch';
import { AudioControl, RunHud, RunWarnings, CoinPops } from '../components/RunHud';
import { RunFeed } from '../components/RunFeed';
import { useWarningAudio } from '../lib/use-warning-audio';
import { hex32, validRoomCode } from '../lib/room-api';
import { runCheckpoint } from '../lib/run-checkpoint';
import { RunSummaryPanel } from './RunResult';

export function OnlineRunPanel({client,getToken,summaryApiUrl=settings.mode==='live'?settings.apiUrl:''}:{client:PlayClient;getToken:()=>Promise<string|null>;summaryApiUrl?:string}){
  const [revision,setRevision]=useState(0);const [assets,setAssets]=useState(false);const [started,setStarted]=useState(false);
  const loaded=useCallback(()=>setAssets(true),[]);const input=useCallback((kind:PlayerInputKind)=>client.input(kind),[client]);
  useDrivingControls(client.runner,input);
  useEffect(()=>{const timer=setInterval(()=>{client.pump();setRevision(n=>n+1);},100);return()=>clearInterval(timer);},[client]);
  const runner=client.runner;const view=runner.current;const enabled=!['result','error','expired','closed'].includes(client.status);const audio=useWarningAudio(runner,revision,enabled);
  const labels:Record<string,string>={idle:'Siap dihubungkan',connecting:'Menghubungkan',syncing:'Menyelaraskan waktu',ready:'Menunggu server',countdown:'Bersiap',running:'Run berlangsung',disconnected:'Koneksi terputus',waiting_result:'Menunggu verifikasi server',result:'Hasil diterima',error:'Perlu diperiksa',expired:'Koneksi kedaluwarsa',closed:'Koneksi ditutup'};
  return <><div className="race-toolbar"><p role="status" data-network-status={client.status}>{labels[client.status]}</p><AudioControl audio={audio}/></div><section className="race-shell" data-phase={runner.phase} data-tick={view.tick} data-lane={view.player.targetLane} data-braking={view.player.braking}>
    <RunHud view={view} tier={client.params.carTier} online/>
    <RaceScene runner={runner} revision={revision} onReady={loaded}/>
    {!started&&<div className="race-overlay"><h2>Siap turun ke jalan?</h2><p>Run dimulai setelah waktu mulai diterima dari server.</p><button className="button" disabled={!assets} onClick={e=>{audio.unlock();e.currentTarget.blur();setStarted(true);void client.connect(getToken);}}>{assets?'Hubungkan run':'Memuat mobil…'}</button></div>}
    {runner.phase==='countdown'&&<div className="countdown" role="status">{Math.ceil(runner.countdownMs/1000)}</div>}
    <RunWarnings view={view} enabled={enabled&&runner.phase==='running'}/>{enabled&&runner.phase==='running'&&<CoinPops runner={runner}/>}
    {started&&client.status==='waiting_result'&&<div className="race-overlay"><h2>Menunggu hasil resmi.</h2><p>Hasil lokal: {view.nearMisses} mepet. Saldo dan kelulusan menunggu verifikasi serta pencatatan server.</p></div>}
    {client.result&&<div className="race-overlay" data-official-result={client.result.status}><span className="badge">HASIL SERVER · {client.result.status}</span><h2>{client.result.nearMisses} mepet</h2><p>{client.result.coins} koin menurut hasil server. Status pencatatan chain diperiksa terpisah.</p><Link className="button" to={`/run/${client.params.runId}`}>Lihat status run</Link></div>}
  </section><div className="practice-controls"><span>← / A kiri · → / D kanan · ↓ / S rem</span><span>{client.verified.size} mepet diverifikasi · {client.recorded.size} tercatat</span></div>
  {client.status==='disconnected'&&<div className="info-panel"><p>Koneksi terputus. Input disimpan sementara; hasil resmi belum dipastikan.</p><button className="button" onClick={()=>void client.connect(getToken)}>Sambungkan kembali</button></div>}
  {client.error&&<p role="alert" className="inline-error">{client.error}</p>}
  {started&&<Link className="quiet-link result-route-link" to={`/run/${client.params.runId}`}>Periksa status run ini →</Link>}
  {started&&summaryApiUrl&&(runner.phase==='ended'||['error','expired','result'].includes(client.status))&&<RunSummaryPanel id={client.params.runId} apiUrl={summaryApiUrl}/>}
  <RunFeed client={client}/>
  {started&&<p className="fine-print">Jangan membuat run baru jika hasil run ini belum jelas. Keluar menutup koneksi. Setelah reload, status run dapat diperiksa; input dan kontrol permainan tidak dilanjutkan otomatis.</p>}</>;
}
function OnlineAccount({roomCode,recoveryRunId}:{roomCode?:string;recoveryRunId?:string}){
  const auth=useAuthRuntime();const game=useStore(session);const [tier,setTier]=useState(0);const [client,setClient]=useState<PlayClient|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [uncertain,setUncertain]=useState(false);
  const launch=useRef(new RunLaunch<PlayClient>()).current;const mounted=useRef(true);
  const [,setSearch]=useSearchParams();
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;launch.invalidate();};},[launch]);
  useEffect(()=>{if(game.status==='signed_out'||game.status==='error'){launch.invalidate();setBusy(false);}},[game.status,launch]);
  async function create(){
    if(launch.busy||uncertain||client||game.status!=='ready')return;
    setBusy(true);setError('');
    try{const next=await launch.begin(auth.getToken,async(token,signal)=>{const run=await createRunApi(settings.apiUrl).create({carTier:tier,...(roomCode?{roomCode}:{})},token,signal);return new PlayClient({...run,carTier:tier},`${settings.wsUrl}/ws/play`);});if(mounted.current&&next){setClient(next);setSearch(old=>runCheckpoint(old,next.params.runId),{replace:true});}
    }catch(e){if(!mounted.current)return;setError(e instanceof Error?e.message:'Run belum dapat dibuat.');if(e instanceof ApiError&&['UNKNOWN_OUTCOME','INVALID_RESPONSE'].includes(e.code))setUncertain(true);}
    finally{if(mounted.current)setBusy(launch.busy);}
  }
  if(client)return <OnlineRunPanel client={client} getToken={auth.getToken}/>;
  if(recoveryRunId)return <section className="recovery-status"><h2>Periksa run sebelumnya.</h2><p>Halaman dimuat ulang atau sesi berganti. Input sebelumnya tidak tersedia di halaman ini. Permainan tidak disambungkan dan run baru tidak dibuat otomatis.</p><RunSummaryPanel id={recoveryRunId} apiUrl={settings.apiUrl}/><Link className="button secondary" to={`/run/${recoveryRunId}`}>Buka halaman hasil</Link></section>;
  return <section className="info-panel"><h2>Pilih mobil untuk run</h2>{roomCode&&<p className="run-room-code">Room <strong>{roomCode}</strong> · Kepemilikan diperiksa server.</p>}<p>Mobil milikmu diperiksa lagi oleh server sebelum run dibuat.</p><label htmlFor="run-car">Mobil</label><select id="run-car" value={tier} disabled={busy||uncertain} onChange={e=>setTier(Number(e.target.value))}>{CARS.filter(car=>game.account?.ownedTiers.includes(car.tier)).map(car=><option key={car.tier} value={car.tier}>Tier {car.tier}</option>)}</select><p><button className="button" disabled={busy||uncertain||game.status!=='ready'} onClick={()=>void create()}>{busy?'Membuat run…':'Buat run online'}</button></p>{game.status!=='ready'&&<p>Akun game menunggu koneksi backend yang mendukung Privy.</p>}{error&&<p role="alert" className="inline-error">{error}</p>}</section>;
}
export function Online(){
  const auth=useAuthRuntime();const [search]=useSearchParams();const room=search.get('room');const recovery=search.get('run');
  if(recovery!==null&&!hex32(recovery))return <div className="narrow"><h1>ID run tidak valid.</h1><p>Tidak ada run atau koneksi baru yang dibuat.</p><Link className="button" to="/online">Kembali ke halaman online</Link></div>;
  if(room!==null&&!validRoomCode(room))return <div className="narrow"><h1>Kode room tidak valid.</h1><Link className="button" to="/room">Kembali ke room</Link></div>;
  return <><div className="practice-heading"><div><span className="eyebrow">RUN ONLINE</span><h1>Balapan bersama.</h1></div><Link className="quiet-link" to="/play">Buka latihan lokal →</Link></div>
    {recovery&&<p className="recovery-links"><Link className="quiet-link" to={`/run/${recovery}`}>Lihat status run sebelumnya tanpa login →</Link></p>}
    {settings.mode!=='live'||!settings.apiUrl||!settings.wsUrl||!auth.configured?<section className="info-panel"><h2>Balapan online sedang disiapkan.</h2><p>Latihan lokal sudah tersedia. Login dan layanan permainan sedang dihubungkan.</p><Link className="button" to="/play">Main latihan</Link></section>:!auth.authenticated||!auth.address?<section className="info-panel"><h2>Masuk untuk memulai run.</h2><p>Gunakan tombol Google di atas. Akun balap akan disiapkan setelah login.</p></section>:<OnlineAccount key={`${auth.subject}:${auth.address}:${room}`} roomCode={room||undefined} recoveryRunId={recovery||undefined}/>}</>;
}

