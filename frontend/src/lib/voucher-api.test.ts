import {expect,it} from 'vitest';
import {createVoucherApi} from './voucher-api';
const buyer='0x1111111111111111111111111111111111111111' as const;
const good={voucher:{buyer,tier:1,coinCost:3000,nonce:'17',expiry:1060},signature:`0x${'11'.repeat(65)}` as const,expiresAt:1060000};
it('requests one voucher with a fresh bearer and only the tier; buyer comes from the verified server identity',async()=>{
 const calls:{url:unknown;init:RequestInit|undefined}[]=[];let tokens=0;const api=createVoucherApi('https://game.test/',async(url,init)=>{calls.push({url,init});return Response.json(good);},()=>1000000);
 expect(await api.create(1,buyer,async()=>{tokens++;return 'fresh';})).toEqual(good);expect(tokens).toBe(1);expect(calls).toHaveLength(1);expect(calls[0].url).toBe('https://game.test/vouchers');expect(calls[0].init?.headers).toMatchObject({Authorization:'Bearer fresh'});expect(JSON.parse(calls[0].init?.body as string)).toEqual({tier:1});
});
it('rejects invalid tier, absent endpoint, missing token or cancellation before reserving coins',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json(good);};const api=createVoucherApi('https://game.test',fetcher,()=>1000000);
 for(const tier of [0,5,1.5])await expect(api.create(tier,buyer,async()=>'token')).rejects.toMatchObject({code:'BAD_REQUEST'});
 await expect(createVoucherApi('',fetcher).create(1,buyer,async()=>'token')).rejects.toMatchObject({code:'NOT_CONFIGURED'});await expect(api.create(1,buyer,async()=>null)).rejects.toMatchObject({code:'UNAUTHORIZED'});const abort=new AbortController();abort.abort();await expect(api.create(1,buyer,async()=>'token',abort.signal)).rejects.toMatchObject({code:'ABORTED'});expect(calls).toBe(0);
});
it('rejects mismatched buyer/tier/cost, invalid uint256 nonce/signature and expired or inconsistent deadlines',async()=>{
 for(const body of [{...good,voucher:{...good.voucher,buyer:'0x2222222222222222222222222222222222222222'}},{...good,voucher:{...good.voucher,tier:2}},{...good,voucher:{...good.voucher,coinCost:1}},{...good,voucher:{...good.voucher,nonce:'-1'}},{...good,voucher:{...good.voucher,nonce:(1n<<256n).toString()}},{...good,signature:'0x1234'},{...good,expiresAt:999},{...good,voucher:{...good.voucher,expiry:999},expiresAt:999000}])await expect(createVoucherApi('https://game.test',async()=>Response.json(body),()=>1000000).create(1,buyer,async()=>'token')).rejects.toMatchObject({code:'INVALID_RESPONSE'});
});
it('never retries a potentially completed reservation after transport, parse or server failures',async()=>{
 for(const fetcher of [async()=>{throw Error('offline');},async()=>new Response('<html>'),async()=>new Response('{}',{status:503})]){let calls=0;const api=createVoucherApi('https://game.test',async()=>{calls++;return fetcher();},()=>1000000);await expect(api.create(1,buyer,async()=>'token')).rejects.toMatchObject({code:'UNKNOWN_OUTCOME'});expect(calls).toBe(1);}
});
it('preserves business rejection codes without treating a rejected reservation as successful',async()=>{
 for(const [code,status] of [['NOT_QUALIFIED',403],['INSUFFICIENT_COINS',409],['UNAUTHORIZED',401]] as const)await expect(createVoucherApi('https://game.test',async()=>Response.json({error:{code}},{status}),()=>1000000).create(1,buyer,async()=>'token')).rejects.toMatchObject({code});
});
