import type { MeResponse } from '@racing-gang/config/protocol';
export type Account = Pick<MeResponse, 'address' | 'coins' | 'coinsPending' | 'coinsReserved' | 'ownedTiers' | 'qualifiedTiers'>;
export type AuthApi = { nonce(address: string): Promise<string>; verify(message: string, signature: string): Promise<string>; me(token: string): Promise<Account> };
export type Identity = { address: string; chainId: number };
export type SessionState = { status: 'anonymous' | 'signing' | 'authenticated' | 'error'; token: string | null; account: Account | null; error: string | null };
import { createStore } from 'zustand/vanilla';
export function createSession(api: AuthApi, chainId: number) {
  const initial: SessionState = { status: 'anonymous', token: null, account: null, error: null };
  const store = createStore<SessionState>(() => ({ ...initial }));
  let identity: Identity | null = null; let generation = 0;
  const clear = () => { generation++; store.setState({ ...initial }); };
  const fail = (error: unknown) => {
    const rejected = typeof error === 'object' && error !== null && ('code' in error && error.code === 4001 || 'name' in error && error.name === 'UserRejectedRequestError');
    store.setState({ ...initial, status: 'error', error: rejected ? 'Tanda tangan dibatalkan. Coba masuk lagi.' : error instanceof Error ? error.message : 'Login gagal. Periksa wallet dan coba lagi.' });
  };
  return Object.assign(store, {
    setIdentity(next: Identity | null) {
      if (identity?.address.toLowerCase() !== next?.address.toLowerCase() || identity?.chainId !== next?.chainId) { clear(); identity = next; }
    },
    logout: clear,
    async login(makeMessage: (nonce: string) => string, sign: (message: string) => Promise<string>) {
      if (store.getState().status === 'signing') return;
      if (!identity || identity.chainId !== chainId) { fail(new Error('Hubungkan wallet pada jaringan Monad testnet.')); return; }
      const captured = { ...identity }; const current = ++generation;
      store.setState({ ...initial, status: 'signing' });
      try {
        const nonce = await api.nonce(captured.address); if (current !== generation) return;
        const message = makeMessage(nonce); const signature = await sign(message); if (current !== generation) return;
        const token = await api.verify(message, signature); if (current !== generation) return;
        const account = await api.me(token); if (current !== generation) return;
        if (account.address.toLowerCase() !== captured.address.toLowerCase()) throw new Error('Profil backend tidak cocok dengan wallet. Masuk lagi.');
        store.setState({ status: 'authenticated', token, account, error: null });
      } catch (error) { if (current === generation) fail(error); }
    },
    async refresh() {
      const token = store.getState().token; const current = generation; const address = identity?.address;
      if (!token || !address) return;
      try {
        const account = await api.me(token); if (current !== generation) return;
        if (account.address.toLowerCase() !== address.toLowerCase()) throw new Error('Profil backend tidak cocok dengan wallet. Masuk lagi.');
        store.setState({ account });
      } catch (error) { if (current === generation) { generation++; fail(error); } }
    },
  });
}
