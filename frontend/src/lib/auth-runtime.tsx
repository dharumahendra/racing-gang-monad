import { createContext, lazy, Suspense, useContext, type ReactNode } from 'react';
import { createAuthApi } from './api';
import { createPrivySession } from './privy-session';
import { settings } from './config';
export const session=createPrivySession(settings.apiUrl?createAuthApi(settings.apiUrl).me:null);
type Runtime={configured:boolean;ready:boolean;authenticated:boolean;subject:string|null;name:string;address:string|null;walletReady:boolean;error:string|null;login:()=>void;logout:()=>void;createWallet:()=>void;getToken:()=>Promise<string|null>;wallet:EmbeddedWallet|null};
/** Privy embedded Ethereum wallet of the signed-in account (EIP-1193). Only used for user-approved transactions. */
export type EmbeddedWallet={address:string;getEthereumProvider:()=>Promise<import('viem').EIP1193Provider>;switchChain:(chainId:number)=>Promise<void>};
const noop=()=>{};
export const AuthContext=createContext<Runtime>({configured:false,ready:true,authenticated:false,subject:null,name:'',address:null,walletReady:false,error:null,login:noop,logout:noop,createWallet:noop,getToken:async()=>null,wallet:null});
export const useAuthRuntime=()=>useContext(AuthContext);
const Configured=lazy(()=>import('./privy-provider'));
function hasStorage(){try{return Boolean(window.localStorage);}catch{return false;}}
export function AuthProvider({children}:{children:ReactNode}) {
  if(!settings.privyAppId||!hasStorage())return children;
  return <Suspense fallback={<div className="auth-loading" role="status">Setting up your racing account…</div>}><Configured>{children}</Configured></Suspense>;
}
