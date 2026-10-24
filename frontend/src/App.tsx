import {useEffect,lazy,Suspense} from 'react';
import {BrowserRouter,NavLink,Route,Routes,useLocation} from 'react-router-dom';
import {Garage} from './pages/Garage';
import {NotFound} from './pages/OtherPages';
import {Result} from './pages/RunResult';
import {Room} from './pages/Rooms';
import {WatchJoin,WatchRoom} from './pages/Watch';
import {Wallet} from './components/Wallet';
import {settings} from './lib/config';
import {BackendStatus} from './components/BackendStatus';
import {ThemeToggle} from './components/Theme';
import {Icon,type IconName} from './components/Icon';
const Practice=lazy(()=>import('./pages/Practice').then(m=>({default:m.Practice})));
const Online=lazy(()=>import('./pages/Online').then(m=>({default:m.Online})));
const NetworkLab=import.meta.env.DEV?lazy(()=>import('./pages/NetworkLab').then(m=>({default:m.NetworkLab}))):null;
const RoomsLab=import.meta.env.DEV?lazy(()=>import('./pages/RoomsLab').then(m=>({default:m.RoomsLab}))):null;
const ResultLab=import.meta.env.DEV?lazy(()=>import('./pages/RunResult').then(m=>({default:m.ResultLab}))):null;
const Golden=import.meta.env.DEV?lazy(()=>import('./pages/Golden').then(m=>({default:m.Golden}))):null;
const PerformanceLab=import.meta.env.DEV?lazy(()=>import('./pages/PerformanceLab').then(m=>({default:m.PerformanceLab}))):null;
const destinations:{to:string;label:string;detail:string;icon:IconName}[]=[
  {to:'/',label:'Garasi',detail:'Pilih kendaraan',icon:'garage'},
  {to:'/play',label:'Main',detail:'Latihan & kontrol',icon:'speed'},
  {to:'/room',label:'Room',detail:'Ajak teman nonton',icon:'room'},
  {to:'/watch',label:'Penonton',detail:'Bikin tantangan',icon:'watch'},
];
function Shell(){
 const location=useLocation(),spectator=location.pathname.startsWith('/watch');
 useEffect(()=>{document.title=`Racing Gang — ${spectator?'Penonton':location.pathname==='/'?'Garasi':'Balapan'}`;window.scrollTo(0,0);},[location.pathname,spectator]);
 return <><a className="skip-link" href="#main">Lewati ke konten</a>
  <header className="site-header"><NavLink className="brand" to="/" aria-label="Racing Gang, garasi"><span className="brand-mark"><Icon name="race"/></span><span>RACING GANG<small>STREET RACING / MONAD</small></span></NavLink><div className="header-right"><ThemeToggle/>{!spectator&&<Wallet/>}</div></header>
  <aside className="cockpit-nav"><span className="nav-caption">COCKPIT</span><nav aria-label="Navigasi utama">{destinations.map(d=><NavLink key={d.to} aria-label={d.label} to={d.to} end={d.to==='/'}><Icon name={d.icon}/><span>{d.label}<small>{d.detail}</small></span><Icon name="chevron" className="nav-chevron"/></NavLink>)}</nav><div className="nav-bottom"><Icon name="race"/><strong>Satu run.<br/>Seratus detik.</strong><p>Cari celah. Kumpulkan mepet.<br/>Bikin penonton ikut deg-degan.</p><span className="nav-rule"/><small>4 LAJUR / GAS OTOMATIS</small></div></aside>
  <div className="app-content"><div className="mode-banner"><span className="status-dot"/><strong>{settings.mode==='mock'?'MODE CONTOH':'MODE LIVE'}</strong><span>{settings.mode==='mock'?'Latihan lokal tersedia. Saldo contoh; hasil belum tercatat on-chain.':settings.apiUrl?'Login Google melalui Privy. Hasil dan pencatatan mengikuti server.':'Latihan tersedia. Fitur online sedang disiapkan.'}</span></div>{settings.mode==='live'&&settings.apiUrl&&<BackendStatus/>}
  <main id="main" tabIndex={-1}><Routes><Route path="/" element={<Garage/>}/><Route path="/play" element={<Suspense fallback={<p>Menyiapkan jalan…</p>}><Practice/></Suspense>}/><Route path="/online" element={<Suspense fallback={<p>Menyiapkan balapan…</p>}><Online/></Suspense>}/>{Golden&&<Route path="/dev/golden" element={<Suspense fallback={<p>Memeriksa fixture…</p>}><Golden/></Suspense>}/>} {NetworkLab&&<Route path="/dev/network" element={<Suspense fallback={<p>Menyiapkan uji jaringan…</p>}><NetworkLab/></Suspense>}/>} {RoomsLab&&<Route path="/dev/rooms" element={<Suspense fallback={<p>Menyiapkan uji room…</p>}><RoomsLab/></Suspense>}/>} {ResultLab&&<Route path="/dev/results" element={<Suspense fallback={<p>Menyiapkan ringkasan…</p>}><ResultLab/></Suspense>}/>} {PerformanceLab&&<Route path="/dev/performance" element={<Suspense fallback={<p>Menyiapkan profil scene…</p>}><PerformanceLab/></Suspense>}/>}<Route path="/room" element={<Room/>}/><Route path="/watch" element={<WatchJoin/>}/><Route path="/watch/:code" element={<WatchRoom/>}/><Route path="/run/:id" element={<Result/>}/><Route path="*" element={<NotFound/>}/></Routes></main>
  <footer><span>RACING GANG <span>/ MONAD TESTNET</span></span><span>Game lokal dan pencatatan chain memiliki status terpisah.</span></footer></div></>;
}
export function App(){return <BrowserRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Shell/></BrowserRouter>;}
