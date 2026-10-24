import { expect, it, vi } from 'vitest';
import { createRoomApi, RoomMonitor, normalizeRoomCode } from './room-api';
const room={code:'AB7K2M',expiresAt:100000,spectators:3,run:null};
it('creates once with bearer and no client-supplied identity; public read sends no bearer',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({code:room.code,expiresAt:room.expiresAt}))).mockResolvedValueOnce(new Response(JSON.stringify(room)));
  const api=createRoomApi('https://game.test',fetcher);await api.create('fresh');expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer fresh');expect(fetcher.mock.calls[0][1].body).toBeUndefined();expect(await api.read('AB7K2M')).toEqual(room);expect(fetcher.mock.calls[1][1].headers?.Authorization).toBeUndefined();
});
it('does not retry ambiguous room creation and rejects mismatched public room code',async()=>{
  const fetcher=vi.fn().mockRejectedValue(new Error('secret'));await expect(createRoomApi('https://game.test',fetcher).create('secret')).rejects.toMatchObject({code:'UNKNOWN_OUTCOME'});expect(fetcher).toHaveBeenCalledTimes(1);
  await expect(createRoomApi('https://game.test',vi.fn().mockResolvedValue(new Response(JSON.stringify({...room,code:'ZZ9K2M'})))).read(room.code)).rejects.toMatchObject({code:'INVALID_RESPONSE'});
});
it('rejects invalid room codes before a request and normalizes pasted codes',async()=>{
  expect(normalizeRoomCode(' ab 7k2m ')).toBe(room.code);const fetcher=vi.fn();await expect(createRoomApi('https://game.test',fetcher).read('../bad')).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
});
it('discards late polls after monitor disposal and never overlaps requests',async()=>{
  let resolve!:(r:typeof room)=>void;let reads=0;const monitor=new RoomMonitor(room.code,{read:()=>{reads++;return new Promise(r=>resolve=r);}},()=>1000);
  const pending=monitor.poll();await monitor.poll();expect(reads).toBe(1);monitor.dispose();resolve(room);await pending;expect(monitor.status).toBe('closed');expect(monitor.room).toBeNull();
});
it('marks expiry without claiming the active run has ended',async()=>{
  const active={...room,expiresAt:500,run:{runId:`0x${'11'.repeat(32)}` as const,seed:`0x${'22'.repeat(32)}` as const,carTier:0,startAt:100}};
  const monitor=new RoomMonitor(room.code,{read:async()=>active},()=>1000);await monitor.poll();expect(monitor.expired).toBe(true);expect(monitor.room?.run?.runId).toBe(active.run.runId);expect(monitor.canStart).toBe(false);monitor.dispose();
});
