import { useCallback, useEffect, useMemo, useState } from 'react';
import { LocalRunner } from '../lib/runner';
import { useDrivingControls } from '../lib/use-driving-controls';
import { Link } from 'react-router-dom';
import { RaceScene } from '../components/RaceScene';
import { AudioControl, RunHud, RunWarnings, CoinPops } from '../components/RunHud';
import { useWarningAudio } from '../lib/use-warning-audio';
const runId=`0x${'11'.repeat(32)}` as const;
const seed='0x8cfd1f92705b1e83840e3e257e0120b7fc40a9569070f053c50a1d6ad428d684';
export function Practice() {
  const [attempt,setAttempt]=useState(0);const runner=useMemo(()=>new LocalRunner({runId,seed,carTier:0}),[attempt]);
  const [revision,setRevision]=useState(0);
  const [assetsReady,setAssetsReady]=useState(false);const onAssetsReady=useCallback(()=>setAssetsReady(true),[]);
  useEffect(()=>{const t=setInterval(()=>setRevision(n=>n+1),100);return()=>clearInterval(t);},[]);
  useDrivingControls(runner);
  const audio=useWarningAudio(runner,revision);

  const view=runner.current;
  const reason={CRASH:'Menabrak kendaraan',TIME_UP:'Waktu habis',RED_ZONE_FAIL:'Terkena red zone',TIMEOUT:'Waktu koneksi habis'};
  return <><div className="practice-heading"><div><span className="eyebrow">LATIHAN / MOBIL QUATERNIUS</span><h1>Cari celahmu.</h1></div><p>Latihan lokal tanpa login.<br/>Tidak menambah saldo atau kelulusan resmi.<br/><Link to="/online" className="quiet-link">Lihat kesiapan run online →</Link></p></div><div className="race-toolbar"><span>Peringatan visual + bunyi pendek</span><AudioControl audio={audio}/></div><section className="race-shell" data-phase={runner.phase} data-tick={view.tick} data-lane={view.player.targetLane} data-braking={view.player.braking}>
    <RunHud view={view} tier={runner.sim.carTier}/>
    <RaceScene runner={runner} revision={revision} onReady={onAssetsReady}/>
    <RunWarnings view={view} enabled={runner.phase==='running'}/>{runner.phase==='running'&&<CoinPops runner={runner}/>}
    {runner.phase==='idle'&&<div className="race-overlay"><span className="badge">MODE LATIHAN</span><h2>Jalan empat lajur.<br/>Satu kesempatan.</h2><p>Gas otomatis. Panah kiri/kanan untuk pindah lajur, tahan bawah untuk rem.</p><button className="button" disabled={!assetsReady} onClick={()=>{audio.unlock();runner.start();setRevision(n=>n+1);}}>{assetsReady?'Mulai latihan':'Memuat mobil…'}</button></div>}
    {runner.phase==='countdown'&&<div className="countdown" role="status">{Math.ceil(runner.countdownMs/1000)}</div>}
    {runner.phase==='ended'&&<div className="race-overlay"><span className="badge">HASIL LATIHAN</span><h2>{view.endReason?reason[view.endReason]:'Run selesai'}</h2><p>{view.nearMisses} mepet · {view.coins.toLocaleString('id-ID')} koin latihan<br/>Hasil lokal belum diverifikasi backend atau dicatat on-chain.</p><button className="button" onClick={()=>{setAttempt(n=>n+1);}}>Ulangi latihan</button></div>}
  </section><div className="practice-controls"><span><kbd>←</kbd> <kbd>A</kbd> Kiri</span><span><kbd>→</kbd> <kbd>D</kbd> Kanan</span><span><kbd>↓</kbd> <kbd>S</kbd> Rem</span><span className="badge">Kamera belakang · NPC aktif</span></div><p className="mobile-game-note">Gunakan keyboard laptop untuk bermain. Panel penonton tetap mendukung HP.</p></>;
}

