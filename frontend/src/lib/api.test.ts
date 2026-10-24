import { expect, it } from 'vitest';
import { createAuthApi } from './api';
it('does not send login requests when no API endpoint is configured', async () => {
  let called = false; const api = createAuthApi('', async () => { called = true; return new Response(); });
  await expect(api.nonce('0x1')).rejects.toMatchObject({ code: 'NOT_CONFIGURED' }); expect(called).toBe(false);
});
it('maps HTTP 401 to a login-again error instead of accepting stale credentials', async () => {
  const api = createAuthApi('https://example.test', async () => new Response('{}', { status: 401 }));
  await expect(api.me('expired')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
it('rejects malformed profile amounts instead of displaying invalid balances', async () => {
  const api = createAuthApi('https://example.test', async () => Response.json({ address: '0x1111111111111111111111111111111111111111', coins: -1, coinsPending: 0, coinsReserved: 0, ownedTiers: [0], qualifiedTiers: [] }));
  await expect(api.me('test')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
