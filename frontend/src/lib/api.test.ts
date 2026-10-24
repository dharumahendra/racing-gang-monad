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

it.each([['WALLET_NOT_READY',409,/wallet|racing account.*ready/i],['AUTH_PROVIDER_UNAVAILABLE',503,/service.*(unavailable|temporarily)|temporarily/i]] as const)('explains recoverable Privy failure %s without asking the user to change accounts',async(code,status,message)=>{
  const api=createAuthApi('https://game.test',async()=>Response.json({error:{code,message:'provider detail'}},{status}));await expect(api.me('fresh')).rejects.toMatchObject({code,message:expect.stringMatching(message)});
});
