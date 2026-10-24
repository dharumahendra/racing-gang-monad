import { useStore } from 'zustand';
import { session, useAuthRuntime } from '../lib/auth-runtime';
export { session } from '../lib/auth-runtime';
export function Wallet() {
  const auth=useAuthRuntime(); const game=useStore(session);
  if(!auth.configured) return <div className="wallet-area"><button className="button small" disabled>Masuk dengan Google</button><small>Login Google sedang disiapkan. Latihan tetap tersedia.</small></div>;
  return <div className="wallet-area">
    {!auth.authenticated ? <button className="button small" disabled={!auth.ready} onClick={auth.login}>{auth.ready?'Masuk dengan Google':'Menyiapkan login…'}</button> : <div className="wallet-actions"><strong>Halo, {auth.name.split(' ')[0]}</strong>{!auth.address?<button className="button small" disabled={!auth.walletReady} onClick={auth.createWallet}>Siapkan akun balap</button>:<span className="badge good">{game.status==='ready'?'Akun game aktif':'Google terhubung'}</span>}<button className="text-button" onClick={auth.logout}>Keluar</button></div>}
    {auth.authenticated && game.status==='waiting_backend' && <small>Login berhasil. Fitur online sedang disiapkan.</small>}
    {auth.authenticated && game.status==='connecting' && <small>Menghubungkan akun game…</small>}
    {(auth.error||game.error)&&<p className="inline-error" role="alert">{auth.error||game.error} {game.status==='error'&&<button className="text-button" onClick={()=>void session.refresh()}>Coba lagi</button>}</p>}
  </div>;
}
