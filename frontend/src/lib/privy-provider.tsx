import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { PrivyProvider, usePrivy, useWallets, useCreateWallet } from '@privy-io/react-auth';
import { AuthContext, session } from './auth-runtime';
import { settings } from './config';
import { useTheme } from '../components/Theme';
function Bridge({children}:{children:ReactNode}) {
  const {ready,authenticated,user,login,logout,getAccessToken}=usePrivy();
  const {wallets,ready:walletsReady}=useWallets();const {createWallet}=useCreateWallet();
  const [error,setError]=useState<string|null>(null);
  const embedded=wallets.find(w=>w.walletClientType==='privy');
  const subject=user?.id;const address=embedded?.address;
  const tokenSource=useRef(getAccessToken);tokenSource.current=getAccessToken;
  useLayoutEffect(()=>{
    if(!ready)return;
    session.reset();
    if(authenticated&&subject&&walletsReady&&address)void session.connect({subject,address},()=>tokenSource.current());
    return()=>session.reset();
  },[ready,authenticated,subject,address,walletsReady]);
  useEffect(()=>{const onFocus=()=>{if(authenticated)void session.refresh();};const t=setInterval(onFocus,60000);window.addEventListener('focus',onFocus);return()=>{clearInterval(t);window.removeEventListener('focus',onFocus);};},[authenticated]);
  return <AuthContext.Provider value={{configured:true,ready,authenticated,subject:subject||null,name:user?.google?.name||'Pembalap',address:address||null,walletReady:walletsReady,error,getToken:()=>tokenSource.current(),
    login:()=>{setError(null);login({loginMethods:['google']});},
    logout:()=>{session.reset();void logout().catch(()=>setError('Belum berhasil keluar. Coba lagi.'));},
    createWallet:()=>{setError(null);void createWallet().catch(()=>setError('Akun balap belum selesai disiapkan. Coba lagi.'));},
  }}>{children}</AuthContext.Provider>;
}
export default function Configured({children}:{children:ReactNode}) {
  const {theme}=useTheme();
  return <PrivyProvider appId={settings.privyAppId} clientId={settings.privyClientId||undefined} config={{loginMethods:['google'],defaultChain:settings.chain,supportedChains:[settings.chain],appearance:{theme,accentColor:theme==='light'?'#0284C7':'#15EAE2',logo:'/favicon.svg',loginMessage:'Masuk dan mulai balapan.'},embeddedWallets:{ethereum:{createOnLogin:'users-without-wallets'}}}}><Bridge>{children}</Bridge></PrivyProvider>;
}

