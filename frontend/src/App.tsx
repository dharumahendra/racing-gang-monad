import {useEffect,lazy,Suspense} from 'react';
import {BrowserRouter,NavLink,Route,Routes,useLocation} from 'react-router-dom';
import {Garage} from './pages/Garage';
import {NotFound} from './pages/OtherPages';
import {Result} from './pages/RunResult';
import {Room} from './pages/Rooms';
import {WatchJoin,WatchRoom} from './pages/Watch';
import {Wallet} from './components/Wallet';
import {NavCoinBalance} from './components/NavCoinBalance';
import {Icon,type IconName} from './components/Icon';
const Audit=lazy(()=>import('./pages/Audit').then(m=>({default:m.Audit})));
const Practice=lazy(()=>import('./pages/Practice').then(m=>({default:m.Practice})));
const Online=lazy(()=>import('./pages/Online').then(m=>({default:m.Online})));
const NetworkLab=import.meta.env.DEV?lazy(()=>import('./pages/NetworkLab').then(m=>({default:m.NetworkLab}))):null;
const RoomsLab=import.meta.env.DEV?lazy(()=>import('./pages/RoomsLab').then(m=>({default:m.RoomsLab}))):null;
const ResultLab=import.meta.env.DEV?lazy(()=>import('./pages/RunResult').then(m=>({default:m.ResultLab}))):null;
const Golden=import.meta.env.DEV?lazy(()=>import('./pages/Golden').then(m=>({default:m.Golden}))):null;
const PerformanceLab=import.meta.env.DEV?lazy(()=>import('./pages/PerformanceLab').then(m=>({default:m.PerformanceLab}))):null;
const destinations:{to:string;label:string;icon:IconName}[]=[
  {to:'/',label:'GARAGE',icon:'garage'},
  {to:'/play',label:'PLAY',icon:'speed'},
  {to:'/room',label:'ROOM',icon:'room'},
  {to:'/watch',label:'SPECTATE',icon:'watch'},
];
function Shell(){
 const location=useLocation(),spectator=location.pathname.startsWith('/watch');
 useEffect(()=>{document.title=`Racing Gang — ${spectator?'Spectate':location.pathname==='/'?'Garage':'Race'}`;window.scrollTo(0,0);},[location.pathname,spectator]);
 return <div className="app-shell"><a className="skip-link" href="#main">Skip to content</a>
  <header className="site-header">
    <NavLink className="brand" to="/" aria-label="Racing Gang, garage">
      <span className="brand-mark"><img src="/Logo.svg" alt="Racing Gang Logo" className="brand-logo-img"/></span>
      <span className="brand-title">RACING GANG</span>
    </NavLink>
    <div className="header-right">
      <NavCoinBalance/>
      {!spectator&&<Wallet/>}
    </div>
  </header>
  <div className="app-content">
    <main id="main" tabIndex={-1}>
      <Routes>
        <Route path="/" element={<Garage/>}/>
        <Route path="/play" element={<Suspense fallback={<p>Setting up the road…</p>}><Practice/></Suspense>}/>
        <Route path="/online" element={<Suspense fallback={<p>Setting up the race…</p>}><Online/></Suspense>}/>
        {Golden&&<Route path="/dev/golden" element={<Suspense fallback={<p>Checking fixtures…</p>}><Golden/></Suspense>}/>}
        {NetworkLab&&<Route path="/dev/network" element={<Suspense fallback={<p>Setting up the network test…</p>}><NetworkLab/></Suspense>}/>}
        {RoomsLab&&<Route path="/dev/rooms" element={<Suspense fallback={<p>Setting up the room test…</p>}><RoomsLab/></Suspense>}/>}
        {ResultLab&&<Route path="/dev/results" element={<Suspense fallback={<p>Setting up the summary…</p>}><ResultLab/></Suspense>}/>}
        {PerformanceLab&&<Route path="/dev/performance" element={<Suspense fallback={<p>Setting up the scene profile…</p>}><PerformanceLab/></Suspense>}/>}
        <Route path="/room" element={<Room/>}/>
        <Route path="/watch" element={<WatchJoin/>}/>
        <Route path="/watch/:code" element={<WatchRoom/>}/>
        <Route path="/run/:id" element={<Result/>}/><Route path="/audit/:id" element={<Suspense fallback={<p>Loading audit…</p>}><Audit/></Suspense>}/>
        <Route path="*" element={<NotFound/>}/>
      </Routes>
    </main>
  </div>
  <nav className="bottom-racing-bar" aria-label="Main navigation">
    <div className="racing-tabs">
      {destinations.map(d=>(
        <NavLink key={d.to} to={d.to} end={d.to==='/'} aria-label={d.to==='/play'?'Start the race':d.label} className={({isActive})=>`racing-tab ${d.to==='/play'?'garage-start':''} ${isActive?'active':''}`}>
          <div className="racing-tab-skew">
            <div className="racing-tab-content">
              <Icon name={d.icon}/>
              <span className="racing-tab-label">{d.label}</span>
            </div>
          </div>
        </NavLink>
      ))}
    </div>
  </nav>
 </div>;
}
export function App(){return <BrowserRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Shell/></BrowserRouter>;}
