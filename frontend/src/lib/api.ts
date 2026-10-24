import type { Account, AuthApi } from './session';
export class ApiError extends Error { constructor(message: string, public code: string) { super(message); } }
export function createAuthApi(baseUrl: string, fetcher: typeof fetch = fetch): AuthApi {
  async function request(path: string, init: RequestInit = {}) {
    if (!baseUrl) throw new ApiError('Backend belum dikonfigurasi. Isi VITE_API_URL untuk login nyata.', 'NOT_CONFIGURED');
    let response: Response;
    try { response = await fetcher(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', ...init.headers } }); }
    catch { throw new ApiError('Backend tidak terjangkau. Periksa koneksi dan coba lagi.', 'NETWORK'); }
    if (response.status === 401) throw new ApiError('Sesi berakhir. Masuk lagi.', 'UNAUTHORIZED');
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError('Permintaan login ditolak backend. Coba masuk lagi.', body?.error?.code || 'API_ERROR');
    if (!body) throw new ApiError('Respons backend tidak valid.', 'INVALID_RESPONSE');
    return body;
  }
  return {
    async nonce(address) { const b = await request('/auth/nonce', { method: 'POST', body: JSON.stringify({ address }) }); if (typeof b.nonce !== 'string' || !b.nonce) throw new ApiError('Nonce tidak valid.', 'INVALID_RESPONSE'); return b.nonce; },
    async verify(message, signature) { const b = await request('/auth/verify', { method: 'POST', body: JSON.stringify({ message, signature }) }); if (typeof b.token !== 'string' || !b.token) throw new ApiError('Token tidak valid.', 'INVALID_RESPONSE'); return b.token; },
    async me(token) {
      const b = await request('/me', { headers: { Authorization: `Bearer ${token}` } });
      const amount = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
      const tiers = (t: unknown) => Array.isArray(t) && t.every(n => amount(n) && n <= 4);
      if (!/^0x[0-9a-fA-F]{40}$/.test(b.address) || !amount(b.coins) || !amount(b.coinsPending) || !amount(b.coinsReserved) || !tiers(b.ownedTiers) || !tiers(b.qualifiedTiers)) throw new ApiError('Format profil belum cocok dengan draft interface.', 'INVALID_RESPONSE');
      return b as Account;
    },
  };
}
