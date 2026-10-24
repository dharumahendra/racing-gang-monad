import { DrivingControls } from '../components/DrivingControls';
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
import { AudioControl, RunHud, RunWarnings, CoinPops, FinalCountdown } from '../components/RunHud';
import { RunFeed } from '../components/RunFeed';
import { useWarningAudio } from '../lib/use-warning-audio';
import { useRaceFocus } from '../lib/use-race-focus';
import { useSelectedCar } from '../lib/selected-car';
import { hex32, validRoomCode } from '../lib/room-api';
import { runCheckpoint } from '../lib/run-checkpoint';
import { RunSummaryPanel } from './RunResult';

export function OnlineRunPanel({client,getToken,summaryApiUrl=settings.mode==='live'?settings.apiUrl:''}:{client:PlayClient;getToken:()=>Promise<string|null>;summaryApiUrl?:string}){
  const [revision,setRevision]=useState(0);const [assets,setAssets]=useState(false);const [started,setStarted]=useState(false);
  const loaded=useCallback(()=>setAssets(true),[]);const input=useCallback((kind:PlayerInputKind)=>client.input(kind),[client]);
  const held=useDrivingControls(client.runner,input);
  // Official result or Qualified event changes balance/qualification: refresh /me so the Garage and coin pill follow the server.
  const qualifiedCount=client.qualified.size,resultStatus=client.result?.status;
  useEffect(()=>{if(resultStatus||qualifiedCount)void session.refresh();},[resultStatus,qualifiedCount]);
  useEffect(()=>{const timer=setInterval(()=>{client.pump();setRevision(n=>n+1);},100);return()=>clearInterval(timer);},[client]);
  const runner=client.runner;const view=runner.current;const enabled=!['result','error','expired','closed'].includes(client.status);const audio=useWarningAudio(runner,revision,enabled);useRaceFocus(enabled&&(runner.phase==='countdown'||runner.phase==='running'));
  const labels:Record<string,string>={idle:'Ready to connect',connecting:'Connecting',syncing:'Syncing time',ready:'Waiting for server',countdown:'Get ready',running:'Run in progress',disconnected:'Connection lost',waiting_result:'Awaiting server verification',result:'Result received',error:'Needs review',expired:'Connection expired',closed:'Connection closed'};
  return <><div className="race-toolbar"><p role="status" data-network-status={client.status}>{labels[client.status]}</p><AudioControl audio={audio}/></div><section className="race-shell" data-phase={runner.phase} data-tick={view.tick} data-lane={view.player.targetLane} data-braking={view.player.braking} data-x={view.player.x} data-steer={view.player.steer}>
    <DrivingControls held={held} enabled={runner.phase==="running"}/><RunHud view={view} tier={client.params.carTier} online/>
    <RaceScene runner={runner} revision={revision} onReady={loaded}/>
    {!started&&<div className="race-overlay"><h2>Ready to hit the road?</h2><p>The run starts once the start time is received from the server.</p><button className="button" disabled={!assets} onClick={e=>{audio.unlock();e.currentTarget.blur();setStarted(true);void client.connect(getToken);}}>{assets?'Connect run':'Loading car…'}</button></div>}
    {runner.phase==='countdown'&&<div className="countdown" role="status">{Math.ceil(runner.countdownMs/1000)}</div>}
    <RunWarnings view={view} enabled={enabled&&runner.phase==='running'}/><FinalCountdown view={view} enabled={enabled&&runner.phase==='running'}/>{enabled&&runner.phase==='running'&&<CoinPops runner={runner}/>}
    {started&&client.status==='waiting_result'&&<div className="race-overlay"><h2>Awaiting the official result.</h2><p>Local result: {view.nearMisses} near misses. Balance and pass status await server verification and recording.</p></div>}
    {client.result&&<div className="race-overlay" data-official-result={client.result.status}><span className="badge">SERVER RESULT · {client.result.status}</span><h2>{client.result.nearMisses} near misses</h2><p>{client.result.coins} coins per the server result. Chain recording status is checked separately.</p><Link className="button" to={`/run/${client.params.runId}`}>View run status</Link></div>}
  {client.status==='disconnected'&&<div className="race-connection-notice"><p>Connection lost. Input is saved temporarily; the official result is not yet confirmed.</p><button className="button" onClick={()=>void client.connect(getToken)}>Reconnect</button></div>}</section><div className="practice-controls"><span>Hold ← / A to steer left · hold → / D to steer right · release to stop steering · hold ↓ / S to brake</span><span>{client.verified.size} near misses verified · {client.recorded.size} recorded</span>{client.qualified.size>0&&<span role="status">Qualified on-chain: {[...client.qualified.keys()].map(t=>`Tier ${t}`).join(", ")}. You can buy it in the Garage.</span>}</div>

  {client.error&&<p role="alert" className="inline-error">{client.error}</p>}
  {started&&<Link className="quiet-link result-route-link" to={`/run/${client.params.runId}`}>Check this run's status →</Link>}
  {started&&summaryApiUrl&&(runner.phase==='ended'||['error','expired','result'].includes(client.status))&&<RunSummaryPanel id={client.params.runId} apiUrl={summaryApiUrl}/>}
  <RunFeed client={client}/>
  {started&&<p className="fine-print">Do not create a new run while this run's result is unclear. Leaving closes the connection. After a reload the run status can be checked; game input and controls do not resume automatically.</p>}</>;
}
function OnlineAccount({roomCode,recoveryRunId}:{roomCode?:string;recoveryRunId?:string}){
  const auth=useAuthRuntime();const game=useStore(session);const selected=useSelectedCar();const [tier,setTier]=useState(selected.tier);useEffect(()=>{setTier(selected.tier);},[selected.tier]);const [client,setClient]=useState<PlayClient|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [uncertain,setUncertain]=useState(false);const [activeId,setActiveId]=useState<string|null>(null);
  const launch=useRef(new RunLaunch<PlayClient>()).current;const mounted=useRef(true);
  const [,setSearch]=useSearchParams();
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;launch.invalidate();};},[launch]);
  useEffect(()=>{if(game.status==='signed_out'||game.status==='error'){launch.invalidate();setBusy(false);}},[game.status,launch]);
  async function create(){
    if(launch.busy||uncertain||client||game.status!=='ready')return;
    setBusy(true);setError('');
    try{const next=await launch.begin(auth.getToken,async(token,signal)=>{const run=await createRunApi(settings.apiUrl).create({carTier:tier,...(roomCode?{roomCode}:{})},token,signal);return new PlayClient({...run,carTier:tier},`${settings.wsUrl}/ws/play`);});if(mounted.current&&next){setClient(next);setSearch(old=>runCheckpoint(old,next.params.runId),{replace:true});}
    }catch(e){if(!mounted.current)return;setError(e instanceof Error?e.message:'Could not create the run.');if(e instanceof ApiError&&['UNKNOWN_OUTCOME','INVALID_RESPONSE','ACTIVE_RUN_EXISTS'].includes(e.code))setUncertain(true);}
    finally{if(mounted.current)setBusy(launch.busy);}
  }
  /** Rekonsiliasi tanpa POST: cari run aktif akun ini. Run CREATED tanpa pengendali boleh dilanjutkan di sini. */
  async function reconcile(){
    if(launch.busy||client||game.status!=='ready')return;
    setBusy(true);setError('');setActiveId(null);
    try{const next=await launch.begin(auth.getToken,async(token,signal)=>{
        const {run,creating}=await createRunApi(settings.apiUrl).active(token,signal);
        if(!run)throw new ApiError(creating?'The server is still processing the run creation. Check again in a few seconds.':'No active run. You can create a new run.',creating?'RUN_CREATING':'NO_ACTIVE_RUN');
        if(run.controlled||run.lifecycle!=='CREATED'){setActiveId(run.runId);throw new ApiError('The active run is already being played in another tab or device, or has already started. Input from another page cannot be resumed here; the honest result appears once the run finishes or times out.','RUN_CONTROLLED');}
        if(roomCode&&run.roomCode!==roomCode){setActiveId(run.runId);throw new ApiError('Your active run is linked to another room. Open that room or wait for the run to end.','RUN_OTHER_ROOM');}
        if(!game.account?.ownedTiers.includes(run.carTier))throw new ApiError('The active run car is not recorded as owned by this account. Reload the account.','RUN_CAR');
        return new PlayClient({runId:run.runId,seed:run.seed,carTier:run.carTier},`${settings.wsUrl}/ws/play`);
      });
      if(mounted.current&&next){setUncertain(false);setTier(next.params.carTier);setClient(next);setSearch(old=>runCheckpoint(old,next.params.runId),{replace:true});}
    }catch(e){if(!mounted.current)return;setError(e instanceof Error?e.message:'Could not check the active run.');if(e instanceof ApiError&&e.code==='NO_ACTIVE_RUN')setUncertain(false);}
    finally{if(mounted.current)setBusy(launch.busy);}
  }
  if(client)return <OnlineRunPanel client={client} getToken={auth.getToken}/>;
  if(recoveryRunId)return <section className="recovery-status"><h2>Check the previous run.</h2><p>The page was reloaded or the session changed. Previous input is not available on this page. The game is not reconnected and a new run is not created automatically.</p><RunSummaryPanel id={recoveryRunId} apiUrl={settings.apiUrl}/><Link className="button secondary" to={`/run/${recoveryRunId}`}>Open the result page</Link></section>;
  return <section className="info-panel"><h2>Pick a car for the run</h2>{roomCode&&<p className="run-room-code">Room <strong>{roomCode}</strong> · Ownership checked by the server.</p>}<p>Your car is re-checked by the server before the run is created.</p><label htmlFor="run-car">Car</label><select id="run-car" value={tier} disabled={busy||uncertain} onChange={e=>setTier(Number(e.target.value))}>{CARS.filter(car=>car.tier===0||game.account?.ownedTiers.includes(car.tier)).map(car=><option key={car.tier} value={car.tier}>Tier {car.tier}</option>)}</select><p><button className="button" disabled={busy||uncertain||game.status!=='ready'} onClick={()=>void create()}>{busy?'Creating run…':'Create online run'}</button></p>{game.status!=='ready'&&<p>Game account is waiting for a backend connection that supports Privy.</p>}{error&&<p role="alert" className="inline-error">{error}</p>}{uncertain&&<p><button className="button secondary" disabled={busy||game.status!=='ready'} onClick={()=>void reconcile()}>{busy?'Checking…':'Check active run'}</button></p>}{activeId&&<p><Link className="quiet-link" to={`/run/${activeId}`}>View active run status →</Link></p>}</section>;
}
export function Online(){
  const auth=useAuthRuntime();const [search]=useSearchParams();const room=search.get('room');const recovery=search.get('run');
  if(recovery!==null&&!hex32(recovery))return <div className="narrow"><h1>Invalid run ID.</h1><p>No run or new connection was created.</p><Link className="button" to="/online">Back to the online page</Link></div>;
  if(room!==null&&!validRoomCode(room))return <div className="narrow"><h1>Invalid room code.</h1><Link className="button" to="/room">Back to room</Link></div>;
  return <><div className="practice-heading"><div><span className="eyebrow">ONLINE RUN</span><h1>Race together.</h1></div><Link className="quiet-link" to="/play">Open local practice →</Link></div>
    {recovery&&<p className="recovery-links"><Link className="quiet-link" to={`/run/${recovery}`}>View the previous run status without logging in →</Link></p>}
    {settings.mode!=='live'||!settings.apiUrl||!settings.wsUrl||!auth.configured?<section className="info-panel"><h2>Online racing is being set up.</h2><p>Local practice is already available. Login and the game services are being connected.</p><Link className="button" to="/play">Play practice</Link></section>:!auth.authenticated||!auth.address?<section className="info-panel"><h2>Sign in to start a run.</h2><p>Use the Google button above. Your racing account will be set up after login.</p></section>:<OnlineAccount key={`${auth.subject}:${auth.address}:${room}`} roomCode={room||undefined} recoveryRunId={recovery||undefined}/>}</>;
}
