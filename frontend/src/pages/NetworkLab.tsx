import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PlayClient } from '../lib/play-client';
import { createRunApi } from '../lib/run-api';
import { OnlineRunPanel } from './Online';
// Development-only protocol test. Fixed test token never grants production access.
export function NetworkLab(){
  const [search]=useSearchParams();
  const [client,setClient]=useState<PlayClient|null>(null);const [error,setError]=useState('');const [pending,setPending]=useState(false);
  const current=useRef<PlayClient|null>(null);const active=useRef(true);const request=useRef<AbortController|null>(null);
  useEffect(()=>{active.current=true;return()=>{active.current=false;request.current?.abort();current.current?.dispose();};},[]);
  async function create(){setPending(true);try{request.current=new AbortController();const run=await createRunApi('/__network_fixture').create({carTier:0},'public-test-fixture',request.current.signal);if(!active.current)return;const next=new PlayClient({...run,carTier:0},`${location.protocol==='https:'?'wss':'ws'}://${location.host}/__network_fixture/ws/play`);current.current=next;setClient(next);}catch{if(active.current)setError('Server pengujian belum dipasang. Jalankan browser test protokol.');}finally{if(active.current)setPending(false);}}
  return <><h1>Uji protokol jaringan.</h1><p>KHUSUS DEVELOPMENT · Server simulasi untuk pengujian FE. Bukan layanan online, hasil resmi, atau verifikasi Privy.</p>{client?<OnlineRunPanel client={client} getToken={async()=> 'public-test-fixture'} summaryApiUrl={search.get('summary')==='1'?'/__network_fixture':''}/>:<button className="button" disabled={pending} onClick={()=>void create()}>Buat run pengujian</button>}{error&&<p role="alert">{error}</p>}</>;
}
