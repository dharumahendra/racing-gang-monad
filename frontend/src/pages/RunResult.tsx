import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CARS, CONFIG_VERSION, TICK_RATE } from '@racing-gang/config';
import { createSummaryApi, RunSummaryMonitor, summaryStats } from '../lib/run-summary';
import { hex32 } from '../lib/room-api';
import { settings } from '../lib/config';
import { transactionUrl } from '../lib/hud';
const reasons={CRASH:'Menabrak kendaraan',RED_ZONE_FAIL:'Terkena red zone',TIME_UP:'Waktu habis',TIMEOUT:'Batas waktu koneksi'};
const lifecycle={CREATED:'Run dibuat',READY:'Menunggu mulai',RUNNING:'Sedang berlangsung',ENDED:'Run selesai'};
const results={VERIFIED:'Terverifikasi server',PARTIAL:'Terverifikasi sebagian',INVALID:'Tidak valid'};
const chains={PENDING:'Menunggu pencatatan',RECORDED:'Tercatat menurut server',RECORD_FAILED:'Pencatatan gagal'};
export function RunSummaryPanel({id,apiUrl}:{id:string;apiUrl:string}){
  const [monitor,setMonitor]=useState<RunSummaryMonitor|null>(null);const [,render]=useState(0);const [limit,setLimit]=useState(20);const [deadline]=useState(()=>Date.now()+90000);
  useEffect(()=>{if(!apiUrl||!hex32(id))return;const next=new RunSummaryMonitor(id,createSummaryApi(apiUrl));setMonitor(next);setLimit(20);void next.poll();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&Date.now()<deadline&&!(next.summary?.lifecycle==='ENDED'&&next.summary.result!==null&&next.summary.chainStatus==='RECORDED'))void next.poll();render(n=>n+1);},3000);const focus=()=>{if(Date.now()<deadline)void next.poll();};window.addEventListener('focus',focus);return()=>{clearInterval(timer);window.removeEventListener('focus',focus);next.dispose();};},[id,apiUrl,deadline]);
  // Refresh the existing monitor; do not restart an effect or discard cached state.
  function refresh(){void monitor?.poll();}
  if(!hex32(id))return <section className="info-panel"><h2>ID run tidak valid</h2><p role="alert">Buka tautan hasil lengkap yang diberikan setelah run dibuat.</p></section>;
  if(!apiUrl)return <section className="info-panel"><h2>Hasil belum tersedia</h2><p>Layanan hasil sedang disiapkan. Tidak ada hasil atau transaksi contoh yang ditampilkan sebagai bukti.</p><code className="break-code">{id}</code></section>;
  const summary=monitor?.summary;const stats=summary?summaryStats(summary):null;
  return <section className="run-summary" data-summary-status={monitor?.status||'loading'} aria-busy={!summary&&monitor?.status!=='error'}>
    <div className="summary-toolbar"><p className="eyebrow">RINGKASAN PUBLIK / TANPA LOGIN</p><button className="button secondary" onClick={refresh} disabled={!monitor}>Perbarui status</button></div>
    {monitor?.error&&<p className="inline-error" role="alert">{monitor.error}{summary?' Data di bawah adalah keadaan terakhir yang berhasil dibaca.':''}</p>}
    {!summary?<p role="status">{monitor?.status==='error'?'Hasil belum dapat dibaca. Coba perbarui status.':'Mengambil status run…'}</p>:<>
      <div className="result-status-grid"><div><small>Permainan</small><strong data-run-lifecycle={summary.lifecycle}>{lifecycle[summary.lifecycle]}</strong><p>{summary.endReason?reasons[summary.endReason]:summary.lifecycle==='ENDED'?'Menunggu rincian akhir.':'Belum ada hasil akhir.'}</p></div><div><small>Verifikasi gameplay</small><strong data-run-verification={summary.result||'PENDING'}>{summary.result?results[summary.result]:'Menunggu pemeriksaan'}</strong><p>{summary.result==='PARTIAL'?'Sebagian data belum dapat dipastikan.':summary.result==='INVALID'?'Hasil ini tidak membuktikan kelulusan.':'Status dari layanan permainan.'}</p></div><div><small>Pencatatan chain</small><strong data-run-chain={summary.chainStatus}>{chains[summary.chainStatus]}</strong><p>Receipt dan saldo akun diperiksa terpisah.</p></div></div>
      <dl className="result-metrics"><div><dt>Mepet menurut server</dt><dd>{summary.nearMisses}</dd></div><div><dt>Memiliki tx hash</dt><dd>{stats!.recorded}<small> / {summary.nearMisses}</small></dd></div><div><dt>Belum memiliki tx hash</dt><dd>{stats!.pending}</dd></div></dl>
      <p className="result-balance-note">{stats!.listedCoins.toLocaleString('id-ID')} koin dari {summary.nearMissList.length} entri yang tersedia. Ini bukan saldo akun. Kelulusan tidak disimpulkan dari jumlah mepet pada halaman ini.</p>
      {summary.configVersion!==CONFIG_VERSION&&<p className="fixture-notice">Versi run {summary.configVersion} berbeda dari aplikasi {CONFIG_VERSION}. Ringkasan hanya dibaca; replay tidak dijalankan.</p>}
      <details className="run-details"><summary>Detail run</summary><dl><dt>ID</dt><dd className="break-code">{summary.runId}</dd><dt>Pemain</dt><dd className="break-code">{summary.player}</dd><dt>Mobil</dt><dd>{CARS[summary.carTier]?.name??`Tier ${summary.carTier}`}</dd><dt>Durasi sampai tick akhir</dt><dd>{summary.endTick===null?'Belum selesai':`${(summary.endTick/TICK_RATE).toFixed(1)} detik`}</dd><dt>Room</dt><dd>{summary.roomCode||'Tanpa room'}</dd><dt>Blok seed / versi</dt><dd>{summary.seedBlock} / {summary.configVersion}</dd></dl></details>
      <div className="result-list-heading"><h2>Bukti mepet.</h2><span>{summary.nearMissList.length} entri tersedia</span></div>
      {summary.nearMissList.length===0?<p>Belum ada entri mepet pada respons server. Pencatatan dapat menyusul.</p>:<ol className="result-rows">{[...summary.nearMissList].sort((a,b)=>a.index-b.index).slice(0,limit).map(row=>{const href=row.txHash?transactionUrl(settings.chain.blockExplorers?.default.url,row.txHash):null;return <li key={row.index} data-summary-receipt={row.index}><div><strong>#{row.index} · {row.vehicleType===1?'Truk':'Mobil'}</strong><span>Tick {row.tick} · {row.coins} koin pada entri</span></div><div><strong>{row.txHash?'Memiliki tx hash':'Menunggu tx hash'}</strong><span>{row.blockNumber!==null?`Blok ${row.blockNumber.toLocaleString('id-ID')}`:'Belum ada blok'}</span>{href&&<a href={href} target="_blank" rel="noopener noreferrer">Lihat transaksi ↗</a>}</div></li>;})}</ol>}
      {summary.nearMissList.length>limit&&<button className="button secondary" onClick={()=>setLimit(n=>n+20)}>Tampilkan 20 berikutnya</button>}
      <p className="fine-print" role="status">{monitor?.lastUpdated?`Terakhir dibaca ${new Date(monitor.lastUpdated).toLocaleTimeString('id-ID')}. `:''}{Date.now()>=deadline?'Pembaruan otomatis dijeda setelah 90 detik. Gunakan Perbarui status.':summary.lifecycle==='ENDED'&&summary.chainStatus==='RECORDED'&&summary.result?'Ringkasan akhir diterima.':'Diperbarui berkala saat halaman terlihat.'}</p>
    </>}
  </section>;
}
export function Result(){const {id=''}=useParams();return <div className="result-page"><span className="eyebrow">HASIL / RUN</span><h1>Bukti perjalanan.</h1><RunSummaryPanel key={id} id={id} apiUrl={settings.mode==='live'?settings.apiUrl:''}/><Link className="button" to="/">Kembali ke garasi</Link></div>;}
export function ResultLab(){const [search]=useSearchParams();const id=search.get('id')||`0x${'11'.repeat(32)}`;return <div className="result-page"><p className="fixture-notice">KHUSUS DEVELOPMENT · Ringkasan dari server simulasi. Bukan hasil live, saldo, atau bukti chain.</p><h1>Bukti perjalanan.</h1><RunSummaryPanel key={id} id={id} apiUrl="/__result_fixture"/></div>;}
