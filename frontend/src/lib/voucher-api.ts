import { CARS } from '@racing-gang/config';
import type { Address, VoucherResponse } from '@racing-gang/config/protocol';
import { ApiError } from './api';

const address = (value: unknown): value is Address => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value);
const uint = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function valid(body: any, buyer: Address, tier: number, now: number): body is VoucherResponse {
  const voucher = body?.voucher;
  return !!voucher && address(voucher.buyer) && voucher.buyer.toLowerCase() === buyer.toLowerCase() &&
    voucher.tier === tier && voucher.coinCost === CARS[tier].coinCost &&
    typeof voucher.nonce === 'string' && voucher.nonce.length <= 78 && /^(0|[1-9]\d*)$/.test(voucher.nonce) && BigInt(voucher.nonce) < 1n << 256n &&
    uint(voucher.expiry) && uint(body.expiresAt) && body.expiresAt === voucher.expiry * 1000 && body.expiresAt > now &&
    typeof body.signature === 'string' && /^0x[\da-f]{130}$/i.test(body.signature);
}

/** Requests a reservation only. No wallet transaction, credit or automatic POST retry. */
export function createVoucherApi(baseUrl: string, fetcher: typeof fetch = fetch, now = Date.now) {
  const endpoint = baseUrl.replace(/\/$/, '');
  return {
    async create(tier: number, buyer: Address, getToken: () => Promise<string | null>, signal?: AbortSignal): Promise<VoucherResponse> {
      if (!endpoint) throw new ApiError('The voucher service isn\u2019t configured.', 'NOT_CONFIGURED');
      if (!Number.isInteger(tier) || tier < 1 || tier >= CARS.length || !address(buyer)) throw new ApiError('Invalid car or buyer account.', 'BAD_REQUEST');
      if (signal?.aborted) throw new ApiError('Request canceled before reserving.', 'ABORTED');
      let token: string | null;
      try { token = await getToken(); } catch { throw new ApiError('Session not available. Sign in again.', 'UNAUTHORIZED'); }
      if (signal?.aborted) throw new ApiError('Request canceled before reserving.', 'ABORTED');
      if (!token) throw new ApiError('Session expired. Sign in again.', 'UNAUTHORIZED');
      let response: Response;
      try {
        response = await fetcher(`${endpoint}/vouchers`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ tier }),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
        });
      } catch { throw new ApiError('Reservation status unknown. Check your reserved balance before trying again.', 'UNKNOWN_OUTCOME'); }
      const body = await response.json().catch(() => null);
      if (response.status >= 500 || (response.ok && !body)) throw new ApiError('Reservation status unknown. Check your reserved balance before trying again.', 'UNKNOWN_OUTCOME');
      if (!response.ok) throw new ApiError('Couldn\u2019t create the voucher. Check the car requirements and account balance.', response.status === 401 ? 'UNAUTHORIZED' : body?.error?.code || 'API_ERROR');
      if (!valid(body, buyer, tier, now())) throw new ApiError('Voucher response doesn\u2019t match or has expired. Check your account reservation.', 'INVALID_RESPONSE');
      return body;
    },
  };
}
