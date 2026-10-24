import { expect, it, vi } from 'vitest';
import { createRunApi } from './run-api';
const run={runId:`0x${'11'.repeat(32)}`,seed:`0x${'22'.repeat(32)}`,seedBlock:5,configVersion:1};
it('creates one run with a fresh bearer, tier and optional room, without sending a player identity',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(run)));
  expect(await createRunApi('https://game.test',fetcher).create({carTier:0,roomCode:'AB7K2M'},'fresh')).toEqual(run);
  expect(fetcher).toHaveBeenCalledTimes(1);const [url,init]=fetcher.mock.calls[0];
  expect(url).toBe('https://game.test/runs');expect(init.headers.Authorization).toBe('Bearer fresh');
  expect(JSON.parse(init.body)).toEqual({carTier:0,roomCode:'AB7K2M'});
});
it('does not retry an ambiguous POST and does not expose its token in the error',async()=>{
  const fetcher=vi.fn().mockRejectedValue(new Error('Bearer sensitive'));
  await expect(createRunApi('https://game.test',fetcher).create({carTier:0},'sensitive')).rejects.toThrow('unknown');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects incompatible config or malformed run identifiers before starting a sim',async()=>{
  for(const body of [{...run,configVersion:99},{...run,seed:'x'}]) {
    await expect(createRunApi('https://game.test',vi.fn().mockResolvedValue(new Response(JSON.stringify(body)))).create({carTier:0},'x')).rejects.toThrow('match');
  }
});
it('preserves unauthorized status and rejects invalid tiers before making a request',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response('{}',{status:401}));
  await expect(createRunApi('https://game.test',fetcher).create({carTier:0},'x')).rejects.toMatchObject({code:'UNAUTHORIZED'});
  fetcher.mockClear();await expect(createRunApi('https://game.test',fetcher).create({carTier:7},'x')).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
});
it('treats a server failure after POST as an unknown outcome instead of a safe retry',async()=>{
  await expect(createRunApi('https://game.test',vi.fn().mockResolvedValue(new Response('{}',{status:503}))).create({carTier:0},'x')).rejects.toMatchObject({code:'UNKNOWN_OUTCOME'});
});
it('looks up the active run with the bearer only and validates the response before adopting it',async()=>{
  const active={...run,carTier:0,roomCode:null,lifecycle:'CREATED',startAt:null,createdAt:1,controlled:false};
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({run:active,creating:false})));
  expect(await createRunApi('https://game.test',fetcher).active('fresh')).toEqual({run:active,creating:false});
  const [url,init]=fetcher.mock.calls[0];expect(url).toBe('https://game.test/runs/active');expect(init.method).toBeUndefined();expect(init.headers.Authorization).toBe('Bearer fresh');
  expect(await createRunApi('https://game.test',vi.fn().mockResolvedValue(new Response(JSON.stringify({run:null,creating:true})))).active('x')).toEqual({run:null,creating:true});
  await expect(createRunApi('https://game.test',vi.fn().mockResolvedValue(new Response(JSON.stringify({run:{...active,configVersion:99},creating:false})))).active('x')).rejects.toMatchObject({code:'INVALID_RESPONSE'});
  await expect(createRunApi('https://game.test',vi.fn().mockResolvedValue(new Response('{}',{status:401}))).active('x')).rejects.toMatchObject({code:'UNAUTHORIZED'});
});
