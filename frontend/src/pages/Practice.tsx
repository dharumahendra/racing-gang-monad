import { DrivingControls } from '../components/DrivingControls';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LocalRunner } from '../lib/runner';
import { useDrivingControls } from '../lib/use-driving-controls';
import { RaceScene } from '../components/RaceScene';
import { Link } from 'react-router-dom';
import { settings } from '../lib/config';
import { AudioControl, RunHud, RunWarnings, CoinPops, FinalCountdown } from '../components/RunHud';
import { useWarningAudio } from '../lib/use-warning-audio';
import { useRaceFocus } from '../lib/use-race-focus';
import { useSelectedCar } from '../lib/selected-car';
import { CARS } from '@racing-gang/config';
const runId=`0x${'11'.repeat(32)}` as const;
const seed='0x8cfd1f92705b1e83840e3e257e0120b7fc40a9569070f053c50a1d6ad428d684';
export function Practice() {
  // Mobil yang dipilih di Garasi (hanya yang dimiliki akun; tanpa login = Starter). Statistik dari shared config.
  const {tier}=useSelectedCar();
  const [attempt,setAttempt]=useState(0);const runner=useMemo(()=>new LocalRunner({runId,seed,carTier:tier}),[attempt,tier]);
  const [revision,setRevision]=useState(0);
  const [assetsReady,setAssetsReady]=useState(false);const onAssetsReady=useCallback(()=>setAssetsReady(true),[]);
  useEffect(()=>{const t=setInterval(()=>setRevision(n=>n+1),100);return()=>clearInterval(t);},[]);
  const held=useDrivingControls(runner);
  const audio=useWarningAudio(runner,revision);

  useRaceFocus(runner.phase==='countdown'||runner.phase==='running');
  const view=runner.current;
  const reason={CRASH:'Hit a vehicle',TIME_UP:'Time up',RED_ZONE_FAIL:'Hit a red zone',TIMEOUT:'Connection timeout'};
  return <><div className="race-toolbar"><h1 className="race-mode-title">Practice Mode</h1><AudioControl audio={audio}/></div><section className="race-shell" data-phase={runner.phase} data-tick={view.tick} data-lane={view.player.targetLane} data-braking={view.player.braking} data-x={view.player.x} data-steer={view.player.steer}>
    <DrivingControls held={held} enabled={runner.phase==="running"}/><RunHud view={view} tier={runner.sim.carTier}/>
    <RaceScene runner={runner} revision={revision} onReady={onAssetsReady}/>
    <RunWarnings view={view} enabled={runner.phase==='running'}/><FinalCountdown view={view} enabled={runner.phase==='running'}/>{runner.phase==='running'&&<CoinPops runner={runner}/>}
    {runner.phase==='idle'&&<div className="race-overlay"><span className="badge">PRACTICE MODE</span><p className="overlay-car">{CARS[runner.sim.carTier].name} · max. {CARS[runner.sim.carTier].maxKmh} km/h</p><ul className="overlay-controls" aria-label="Controls"><li><kbd>←</kbd> <kbd>A</kbd> Hold left</li><li><kbd>→</kbd> <kbd>D</kbd> Hold right</li><li><kbd>↑</kbd> <kbd>W</kbd> Hold gas</li><li><kbd>↓</kbd> <kbd>S</kbd> Hold brake</li></ul><button className="button" disabled={!assetsReady} onClick={()=>{audio.unlock();runner.start();setRevision(n=>n+1);}}>{assetsReady?'Start practice':'Loading car…'}</button>{settings.mode==='live'&&<Link className="quiet-link" to="/online">Official online run (counts for coins) →</Link>}</div>}
    {runner.phase==='countdown'&&<div className="countdown" role="status">{Math.ceil(runner.countdownMs/1000)}</div>}
    {runner.phase==='ended'&&<div className="race-overlay"><span className="badge">PRACTICE RESULT</span><h2>{view.endReason?reason[view.endReason]:'Run finished'}</h2><p>{view.nearMisses} near misses · {view.coins.toLocaleString('en-US')} practice coins<br/>Local result not yet verified by backend or recorded on-chain.</p><button className="button" onClick={()=>{setAttempt(n=>n+1);}}>Retry practice</button></div>}
  </section></>;
}
