import type {GarageCar} from './Garage';
import type {Account} from '../lib/session';

// Only consumed behind import.meta.env.DEV. Never modifies shared config or session.
export function garageFixture(cars:readonly GarageCar[],account:Account|null){
 const mode=new URLSearchParams(window.location.search).get('garageData');
 if(!['worst','empty','one','zero'].includes(mode??''))return null;
 const balance=mode==='zero'?{coins:0,coinsReserved:0,coinsPending:0}:{coins:1234567890,coinsReserved:400000,coinsPending:9999999};
 return {balance,account:mode==='worst'?{address:'0x0000000000000000000000000000000000000001',...balance,ownedTiers:[0,1],qualifiedTiers:[2]} as Account:account,
  cars:mode==='empty'?[]:mode==='one'?cars.slice(0,1):mode==='worst'?cars.map((c,i)=>({...c,name:['Starter — Edisi Komunitas Jalanan Nusantara','J','KendaraanEksperimentalSupercharged','車両テスト・サーキットエディション','Tier 4 — Édition Grand Prix 🏁'][i]})):cars};
}
export function GarageDataSwitch(){
 const current=new URLSearchParams(window.location.search).get('garageData')??'demo';
 if(!new URLSearchParams(window.location.search).has('garageData'))return null;
 return <nav className="garage-data-switch" aria-label="Development garage data">{['demo','worst','empty','one','zero'].map(mode=><a key={mode} href={`/?garageData=${mode}`} aria-current={mode===current?'page':undefined}>{({demo:'Demo data',worst:'Worst case',empty:'Empty',one:'One',zero:'Zero'})[mode]}</a>)}</nav>;
}
