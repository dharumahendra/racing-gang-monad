import { createStore } from 'zustand/vanilla';
import type { Account } from './session';
export type PrivyIdentity = { subject: string; address: string };
type State = { status: 'signed_out' | 'connecting' | 'ready' | 'waiting_backend' | 'error'; account: Account | null; error: string | null };
export function createPrivySession(profile: ((token: string) => Promise<Account>) | null) {
  const store = createStore<State>(() => ({ status: 'signed_out', account: null, error: null }));
  let generation=0;
  let identity:PrivyIdentity|null=null;
  let getToken:(()=>Promise<string|null>)|null=null;
  async function load() {
    const current=++generation; const who=identity; const source=getToken;
    if(!who||!source)return;
    store.setState({status:profile?'connecting':'waiting_backend',account:null,error:null});
    if(!profile)return;
    try {
      const token=await source(); if(current!==generation)return;
      if(!token)throw new Error('Your Google session expired. Sign in again.');
      const account=await profile(token); if(current!==generation)return;
      if(account.address.toLowerCase()!==who.address.toLowerCase())throw new Error('Your game profile doesn\u2019t match your racing account. Try signing in again.');
      store.setState({status:'ready',account,error:null});
    } catch(error) {if(current===generation)store.setState({status:'error',account:null,error:error instanceof Error?error.message:'Couldn\u2019t connect the game account.'});}
  }
  return Object.assign(store, {
    async connect(who:PrivyIdentity,source:()=>Promise<string|null>) {identity={...who};getToken=source;await load();},
    reset(){generation++;identity=null;getToken=null;store.setState({status:'signed_out',account:null,error:null});},
    refresh:load,
  });
}
