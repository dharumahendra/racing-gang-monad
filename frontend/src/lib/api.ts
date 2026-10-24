import type { Account, AuthApi } from './session';
export class ApiError extends Error { constructor(message: string, public code: string) { super(message); } }
export function createAuthApi(baseUrl: string, fetcher: typeof fetch = fetch): AuthApi {
  async function request(path: string, init: RequestInit = {}) {
    if (!baseUrl) throw new ApiError('Backend isn\u2019t configured. Set VITE_API_URL to use real login.', 'NOT_CONFIGURED');
    let response: Response;
    try { response = await fetcher(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', ...init.headers } }); }
    catch { throw new ApiError('Backend unreachable. Check your connection and try again.', 'NETWORK'); }
    if (response.status === 401) throw new ApiError('Session expired. Sign in again.', 'UNAUTHORIZED');
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const code=body?.error?.code||'API_ERROR';
      const message=code==='WALLET_NOT_READY'?'Your racing account isn\u2019t ready. Finish creating the wallet and try again.':code==='AUTH_PROVIDER_UNAVAILABLE'?'The account service is temporarily unavailable. Try again shortly without switching accounts.':'The backend rejected the login request. Try signing in again.';
      throw new ApiError(message,code);
    }
    if (!body) throw new ApiError('Invalid backend response.', 'INVALID_RESPONSE');
    return body;
  }
  return {
    async nonce(address) { const b = await request('/auth/nonce', { method: 'POST', body: JSON.stringify({ address }) }); if (typeof b.nonce !== 'string' || !b.nonce) throw new ApiError('Invalid nonce.', 'INVALID_RESPONSE'); return b.nonce; },
    async verify(message, signature) { const b = await request('/auth/verify', { method: 'POST', body: JSON.stringify({ message, signature }) }); if (typeof b.token !== 'string' || !b.token) throw new ApiError('Invalid token.', 'INVALID_RESPONSE'); return b.token; },
    async me(token) {
      const b = await request('/me', { headers: { Authorization: `Bearer ${token}` } });
      const amount = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
      const tiers = (t: unknown) => Array.isArray(t) && t.every(n => amount(n) && n <= 4);
      if (!/^0x[0-9a-fA-F]{40}$/.test(b.address) || !amount(b.coins) || !amount(b.coinsPending) || !amount(b.coinsReserved) || !tiers(b.ownedTiers) || !tiers(b.qualifiedTiers)) throw new ApiError('Profile format doesn\u2019t match the interface draft.', 'INVALID_RESPONSE');
      return b as Account;
    },
  };
}
