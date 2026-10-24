import { useStore } from 'zustand';
import { session, useAuthRuntime } from '../lib/auth-runtime';
export { session } from '../lib/auth-runtime';

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.21 1.48-5.02 2.34-8.16 2.34-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

export function Wallet() {
  const auth=useAuthRuntime(); const game=useStore(session);
  if(!auth.configured) return <div className="wallet-area"><button className="google-login-btn" disabled aria-label="Sign in with Google" title="Google login is being set up. Practice is still available."><GoogleIcon className="google-icon"/></button></div>;
  return <div className="wallet-area">
    {!auth.authenticated ? <button className="google-login-btn" disabled={!auth.ready} onClick={auth.login} aria-label="Sign in with Google" title={auth.ready?'Sign in with Google':'Setting up login…'}><GoogleIcon className="google-icon"/></button> : <div className="wallet-actions"><strong>Hi, {auth.name.split(' ')[0]}</strong>{!auth.address?<button className="button small" disabled={!auth.walletReady} onClick={auth.createWallet}>Set up racing account</button>:null}<button type="button" className="logout-btn" onClick={auth.logout}>Log out</button></div>}
    {auth.authenticated && game.status==='waiting_backend' && <small>Signed in. Online features are being set up.</small>}
    {auth.authenticated && game.status==='connecting' && <small>Connecting game account…</small>}
    {(auth.error||game.error)&&<p className="inline-error" role="alert">{auth.error||game.error} {game.status==='error'&&<button className="text-button" onClick={()=>void session.refresh()}>Try again</button>}</p>}
  </div>;
}
