import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Garage } from './pages/Garage';
import { NotFound } from './pages/OtherPages';
import { Result } from './pages/RunResult';
import { Room } from './pages/Rooms';
import { WatchJoin, WatchRoom } from './pages/Watch';
import { Wallet } from './components/Wallet';
import { settings } from './lib/config';
const Practice=lazy(()=>import('./pages/Practice').then(m=>({default:m.Practice})));
const Online=lazy(()=>import('./pages/Online').then(m=>({default:m.Online})));
const NetworkLab=import.meta.env.DEV?lazy(()=>import('./pages/NetworkLab').then(m=>({default:m.NetworkLab}))):null;
const RoomsLab=import.meta.env.DEV?lazy(()=>import('./pages/RoomsLab').then(m=>({default:m.RoomsLab}))):null;
const ResultLab=import.meta.env.DEV?lazy(()=>import('./pages/RunResult').then(m=>({default:m.ResultLab}))):null;
const Golden=import.meta.env.DEV?lazy(()=>import('./pages/Golden').then(m=>({default:m.Golden}))):null;
const PerformanceLab=import.meta.env.DEV?lazy(()=>import('./pages/PerformanceLab').then(m=>({default:m.PerformanceLab}))):null;
function Shell() {
  const location = useLocation(); const spectator = location.pathname.startsWith('/watch');
  useEffect(() => { document.title = `Racing Gang — ${spectator ? 'Penonton' : location.pathname === '/' ? 'Garasi' : 'Pratinjau'}`; window.scrollTo(0,0); }, [location.pathname, spectator]);
  return <><a className="skip-link" href="#main">Lewati ke konten</a><header className="site-header"><NavLink className="brand" to="/" aria-label="Racing Gang, garasi"><span className="brand-mark" aria-hidden="true">RG<span>////</span></span><span>RACING<br/>GANG</span></NavLink><nav aria-label="Navigasi utama"><NavLink to="/" end>Garasi</NavLink><NavLink to="/play">Main</NavLink><NavLink to="/room">Room</NavLink><NavLink to="/watch">Penonton</NavLink></nav>{!spectator && <Wallet/>}</header><div className="mode-banner"><span className="status-dot"/><strong>{settings.mode === 'mock' ? 'MODE CONTOH' : 'MODE LIVE'}</strong><span>{settings.mode === 'mock' ? 'Latihan lokal tersedia. Saldo contoh; hasil belum tercatat on-chain.' : settings.apiUrl ? 'Login Google melalui Privy. Mode online masih tahap integrasi.' : 'Latihan tersedia. Fitur online sedang disiapkan.'}</span><span className="build-label">LATIHAN / BELUM RANKED</span></div><main id="main" tabIndex={-1}><Routes><Route path="/" element={<Garage/>}/><Route path="/play" element={<Suspense fallback={<p>Menyiapkan jalan…</p>}><Practice/></Suspense>}/>{Golden && <Route path="/dev/golden" element={<Suspense fallback={<p>Memeriksa fixture…</p>}><Golden/></Suspense>}/>}<Route path="/online" element={<Suspense fallback={<p>Menyiapkan balapan…</p>}><Online/></Suspense>}/>{NetworkLab && <Route path="/dev/network" element={<Suspense fallback={<p>Menyiapkan uji jaringan…</p>}><NetworkLab/></Suspense>}/>}{RoomsLab && <Route path="/dev/rooms" element={<Suspense fallback={<p>Menyiapkan uji room…</p>}><RoomsLab/></Suspense>}/>}{ResultLab && <Route path="/dev/results" element={<Suspense fallback={<p>Menyiapkan ringkasan…</p>}><ResultLab/></Suspense>}/>}{PerformanceLab && <Route path="/dev/performance" element={<Suspense fallback={<p>Menyiapkan profil scene…</p>}><PerformanceLab/></Suspense>}/>}<Route path="/room" element={<Room/>}/><Route path="/watch" element={<WatchJoin/>}/><Route path="/watch/:code" element={<WatchRoom/>}/><Route path="/run/:id" element={<Result/>}/><Route path="*" element={<NotFound/>}/></Routes></main><footer><span>RACING GANG <span className="muted">/ MONAD TESTNET</span></span><span>Latihan lokal · hasil belum dicatat on-chain</span></footer></>;
}
export function App() { return <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Shell/></BrowserRouter>; }





