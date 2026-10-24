import {useEffect, useState} from 'react';
import {useStore} from 'zustand';
import {CARS,toKmh} from '@racing-gang/config';
import {CarPreview} from '../components/CarPreview';
import {Icon} from '../components/Icon';
import {session} from '../components/Wallet';
import {garageFixture,GarageDataSwitch} from './garage-dev';
import {useSelectedCar} from '../lib/selected-car';
import {explorerTx,usePurchase,useSupply} from '../lib/purchase-runtime';

export type GarageCar={tier:number;name:string;maxSpeed:number;reqNearMiss:number;minCarTier:number;coinCost:number;priceMon:string};
const number=(n:number)=>n.toLocaleString('en-US');
const classes=['The original','Street class','Sport class','Pro class','Ultimate class'];
/** public/assets/backgroundShowroom.png: 2168×725, horizon (titik hilang lantai/dinding) ± 60% dari atas. */
const SHOWROOM_BACKDROP={width:2168,height:725,horizon:.6};

function VehicleSpecsModal({
 car,
 owned,
 qualified,
 onClose,
}:{
 car:GarageCar;
 owned:boolean;
 qualified:boolean;
 onClose:()=>void;
}){
 return (
  <div className="specs-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="specs-modal-title">
   <div className="specs-modal-card" onClick={e=>e.stopPropagation()}>
    <div className="specs-modal-header">
     <div>
      <span className="specs-modal-class">{classes[car.tier]}</span>
      <h3 id="specs-modal-title">{car.name}</h3>
     </div>
     <button type="button" className="specs-modal-close" onClick={onClose} aria-label="Close specs">
      ✕
     </button>
    </div>

    <div className="specs-modal-body">
     <dl className="specs-grid">
      <div className="spec-item">
       <dt>Top Speed</dt>
       <dd>{toKmh(car.maxSpeed)} <small>km/h</small></dd>
      </div>
      <div className="spec-item">
       <dt>Near-Miss Target (1 Run)</dt>
       <dd>{car.reqNearMiss||'—'}</dd>
      </div>
      <div className="spec-item">
       <dt>Minimum Car</dt>
       <dd>{car.tier<2?'Starter':`Tier ${car.minCarTier}`}</dd>
      </div>
      <div className="spec-item">
       <dt>Coin Price</dt>
       <dd>{number(car.coinCost)}</dd>
      </div>
      <div className="spec-item">
       <dt>MON Testnet</dt>
       <dd>{car.priceMon} MON</dd>
      </div>
      <div className="spec-item">
       <dt>Vehicle Status</dt>
       <dd>{owned?'Owned':qualified?'Requirements met':'Locked'}</dd>
      </div>
     </dl>

     <div className="specs-notice">
      <p>
       {car.tier===0
        ?'The Starter is free, not an NFT, and can be used right away for practice.'
        :`${owned?'Vehicle owned.':qualified?'Requirements met.':'Requirements not verified yet.'} Soulbound car. Target of ${car.reqNearMiss} near misses using ${car.minCarTier===0?'Starter':`Tier ${car.minCarTier}`} or higher. Stock and purchases follow the contract.`}
      </p>
     </div>

     {car.tier===0||owned?<button className="button secondary specs-purchase-btn" disabled>{car.tier===0?'Starter · Default Choice':'Already Owned'}</button>:<PurchasePanel car={car} qualified={qualified}/>}
    </div>
   </div>
  </div>
 );
}

const purchaseLabels:Record<string,string>={reserving:'Reserving coins…',switching:'Switching to Monad testnet…',checking:'Checking purchase…',wallet:'Confirm in your wallet…',pending:'Waiting for confirmation…',syncing:'Confirmed. Updating your garage…'};
/** Buy flow for a locked tier. Ownership changes only when /me reports it (indexer), never optimistically. */
function PurchasePanel({car,qualified}:{car:GarageCar;qualified:boolean}){
 const {state,blockers,buy,check,ready}=usePurchase(car.tier);
 const supply=useSupply(car.tier);
 const hash='hash' in state?state.hash:undefined,link=explorerTx(hash);
 const busy=state.step in purchaseLabels;
 const stock=supply.left===null?null:supply.soldOut?'Sold out':`${number(Number(supply.left))} of ${number(Number(supply.supply))} left`;
 const reason=!qualified?`Reach ${car.reqNearMiss} near misses in one verified run to unlock buying.`:supply.soldOut?'This car is sold out.':blockers[0]??null;
 let status:string|null=null;
 if(state.step==='done')status='Purchase complete. The car is now in your garage.';
 else if(state.step==='synced_late')status='Confirmed on-chain. Your garage updates once the server catches up.';
 else if(state.step==='error'||state.step==='unknown')status=state.message;
 else if(busy)status=purchaseLabels[state.step]!;
 const canBuy=ready&&qualified&&!supply.soldOut&&!busy&&state.step!=='unknown'&&state.step!=='done'&&state.step!=='synced_late'&&!(state.step==='error'&&!state.retry);
 return <div className="purchase-panel" data-purchase-step={state.step}>
  {stock&&<p className="purchase-stock" data-sold-out={supply.soldOut}>{stock}</p>}
  {status&&<p className={state.step==='error'?'inline-error':'purchase-status'} role={state.step==='error'?'alert':'status'}>{status}{link&&<> <a href={link} target="_blank" rel="noreferrer">View transaction</a></>}</p>}
  {state.step==='unknown'||state.step==='synced_late'
   ?<button className="button specs-purchase-btn" onClick={check}>Check status</button>
   :<button className="button specs-purchase-btn" disabled={!canBuy} onClick={buy}>{busy?purchaseLabels[state.step]:supply.soldOut?'Sold Out':`Buy · ${car.priceMon} MON + ${number(car.coinCost)} coins`}</button>}
  {!canBuy&&!busy&&reason&&state.step==='idle'&&<p className="purchase-blocker">{reason}</p>}
 </div>;
}
export function Garage(){
 const selection=useSelectedCar();
 const [tier,setTier]=useState(selection.tier);
 const [showSpecs,setShowSpecs]=useState(false);
 // Buka Garasi di mobil yang sedang dipakai (juga saat profil akun selesai dimuat).
 useEffect(()=>{setTier(selection.tier);},[selection.tier]);
 const sessionAccount=useStore(session,s=>s.account);
 const fixture=import.meta.env.DEV?garageFixture(CARS,sessionAccount):null;
 const cars:readonly GarageCar[]=fixture?.cars??CARS,account=fixture?fixture.account:sessionAccount;
 const car=cars.find(c=>c.tier===tier)??cars[0];
 const owned=!!car&&(car.tier===0||!!account?.ownedTiers.includes(car.tier));
 const qualified=!!car&&!!account?.qualifiedTiers.includes(car.tier);

 const prevCar=()=>setTier(t=>(t-1+cars.length)%cars.length);
 const nextCar=()=>setTier(t=>(t+1)%cars.length);

 useEffect(()=>{
  document.body.classList.add('garage-route');
  return ()=>{document.body.classList.remove('garage-route');};
 },[]);

 return <div className="garage-page">
  <h1 className="sr-only">Your Garage</h1>
  <div aria-label="Car selection" style={{position:'fixed',top:0,left:0,zIndex:9999,opacity:0.001,pointerEvents:'auto',display:'flex'}}>
   {cars.map(c=>{
    return <button key={c.tier} type="button" aria-label={c.tier===0?'S Starter':`T${c.tier} Preview`} aria-pressed={tier===c.tier} data-tier={c.tier} onClick={()=>setTier(c.tier)} style={{width:'24px',height:'24px',border:'none',background:'transparent',cursor:'pointer'}}>
     {c.name}
    </button>;
   })}
  </div>
  {car?<div className="garage-layout">
   <section className="garage-showcase" aria-labelledby="selected-car-name">
    <header className="selected-car-heading">
     <div>
      <p className="selected-car-class">{classes[car.tier]}{(owned||qualified)&&<span className="ownership-state"><Icon name="check"/>{owned?'Owned':'Requirements met'}</span>}</p>
      <div className="selected-car-title-wrap">
       <h2 id="selected-car-name" dir="auto">{car.name}</h2>
       <button
        type="button"
        className="specs-badge-btn"
        onClick={()=>setShowSpecs(true)}
        aria-label="View car specs"
        title="Open vehicle specs & requirements"
       >
        <Icon name="bolt"/>
        <span>Specs</span>
       </button>
       {owned&&(selection.tier===car.tier
        ?<span className="car-in-use" role="status"><Icon name="check"/>In use</span>
        :<button type="button" className="use-car-btn" disabled={!selection.canSelect(car.tier)} onClick={()=>selection.select(car.tier)}>Use this car</button>)}
      </div>
     </div>

    </header>

    <div className="showroom-stage-wrap">
     <button type="button" className="car-loop-btn prev" onClick={prevCar} aria-label="Switch to previous car" title="Previous car">
      <Icon name="left"/>
     </button>

     <CarPreview key={car.tier} tier={car.tier} backdrop={SHOWROOM_BACKDROP}/>
     {!owned&&<div className="car-lock" aria-hidden="true"><span className="car-lock-badge"><Icon name="lock"/></span></div>}

     <button type="button" className="car-loop-btn next" onClick={nextCar} aria-label="Switch to next car" title="Next car">
      <Icon name="chevron"/>
     </button>
    </div>
   </section>

   {showSpecs&&<VehicleSpecsModal car={car} owned={owned} qualified={qualified} onClose={()=>setShowSpecs(false)}/>}
  </div>:<section className="garage-empty"><Icon name="garage"/><h2>No vehicles yet.</h2><p>The collection isn't available yet. You can still open local practice.</p></section>}
  {import.meta.env.DEV&&<GarageDataSwitch/>}
 </div>;
}
