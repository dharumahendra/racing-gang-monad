import { createContext, lazy, Suspense, useContext, type ReactNode } from 'react';
import { createAuthApi } from './api';
import { createPrivySession } from './privy-session';
import { settings } from './config';
export const session=createPrivySession(settings.apiUrl?createAuthApi(settings.apiUrl).me:null);
type Runtime={configured:boolean;ready:boolean;authenticated:boolean;subject:string|null;name:string;address:string|null;walletReady:boolean;error:string|null;login:()=>void;logout:()=>void;createWallet:()=>void;getToken:()=>Promise<string|null>};
const noop=()=>{};
export const AuthContext=createContext<Runtime>({configured:false,ready:true,authenticated:false,subject:null,name:'',address:null,walletReady:false,error:null,login:noop,logout:noop,createWallet:noop,getToken:async()=>null});
export const useAuthRuntime=()=>useContext(AuthContext);
const Configured=lazy(()=>import('./privy-provider'));
export function AuthProvider({children}:{children:ReactNode}) {
  if(!settings.privyAppId)return children;
  return <Suspense fallback={<div className="auth-loading" role="status">Menyiapkan akun balap…</div>}><Configured>{children}</Configured></Suspense>;
}
