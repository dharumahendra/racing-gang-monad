// Real FE REST/WS clients → listening Fastify → real JWT verifier and SQLite.
// Only the external Privy user service and blockchain are test doubles.
import { afterEach, beforeEach, expect, it } from 'vitest';
import { generateKeyPair, exportSPKI, SignJWT } from 'jose';
import WebSocket from 'ws';
import { Autopilot } from '@racing-gang/sim/dev';
import { makeTestApp } from './helpers';
import { runs, reservations } from '../src/db/schema';
import { addLedgerEntry } from '../src/services/ledger';
import { createAuthApi } from '../../frontend/src/lib/api';
import { createRoomApi } from '../../frontend/src/lib/room-api';
import { createRunApi } from '../../frontend/src/lib/run-api';
import { createSummaryApi } from '../../frontend/src/lib/run-summary';
import { createVoucherApi } from '../../frontend/src/lib/voucher-api';
import { PlayClient } from '../../frontend/src/lib/play-client';
import { WatchClient } from '../../frontend/src/lib/watch-client';

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const accounts = { 'did:privy:integration-a': A, 'did:privy:integration-b': B };
const pause = () => new Promise(resolve => setTimeout(resolve, 1));
async function waitFor(condition, label) {
  const deadline = Date.now() + 10000;
  while (!condition()) { if (Date.now() > deadline) throw Error(`Timeout: ${label}`); await pause(); }
}
let t, base, keys, clients, sockets, providerCalls;
beforeEach(async () => {
  clients = []; sockets = []; providerCalls = [];
  keys = await generateKeyPair('ES256');
  t = await makeTestApp({ ALLOW_SIWE_LOGIN: 'false', PRIVY_APP_ID: 'frontend-integration', PRIVY_VERIFICATION_KEY: await exportSPKI(keys.publicKey), PRIVY_APP_SECRET: 'integration-only' }, {
    fetch: async url => {
      providerCalls.push(String(url));
      const address = accounts[decodeURIComponent(String(url).split('/').at(-1))];
      return address ? Response.json({ linked_accounts: [{ type: 'wallet', chain_type: 'ethereum', connector_type: 'embedded', wallet_client_type: 'privy', address }] }) : new Response('{}', { status: 404 });
    },
  });
  base = await t.app.listen({ port: 0, host: '127.0.0.1' });
});
afterEach(async () => {
  for (const client of clients) client.dispose();
  for (const socket of sockets) socket.terminate();
  await waitFor(() => t.app.websocketServer.clients.size === 0, 'server sockets closed');
  await t.close();
});
async function token(subject = 'did:privy:integration-a', audience = 'frontend-integration') {
  return new SignJWT({}).setProtectedHeader({ alg: 'ES256' }).setIssuer('privy.io').setAudience(audience).setSubject(subject)
    .setIssuedAt(Math.floor(t.clock.now() / 1000)).setExpirationTime(Math.floor(t.clock.now() / 1000) + 3600).sign(keys.privateKey);
}
function socketAt(url) { const socket = new WebSocket(url); sockets.push(socket); return socket; }

it.each(['local', 'event'])('FE clients keep parity through room, disruption, outage and lost result with seed mode %s', async mode => {
  t.ctx.env.SEED_SOURCE = mode;
  const bearer = await token();
  expect((await createAuthApi(base).me(bearer)).address).toBe(A);
  const roomApi = createRoomApi(base);
  const room = await roomApi.create(bearer);
  const rpcHash = t.chain.reads.blockHash;
  if (mode === 'event') t.chain.reads.blockHash = async () => `0x${'5e'.repeat(32)}`;
  const run = await createRunApi(base).create({ carTier: 0, roomCode: room.code }, bearer);
  t.chain.reads.blockHash = rpcHash;
  let dropFinal = true;
  const playSockets = []; const frames = [];
  const player = new PlayClient({ ...run, carTier: 0 }, base.replace('http:', 'ws:') + '/ws/play', t.clock.now, url => {
    const socket = socketAt(url); playSockets.push(socket); let dropped = false;
    return { get readyState() { return socket.readyState; }, send: value => socket.send(value), close: () => socket.close(),
      addEventListener(type, callback) { socket.addEventListener(type, event => {
        if(type === 'message' && dropped)return;
        if(type === 'message'){frames.push(JSON.parse(String(event.data)));if(frames.length>5)frames.shift();}
        if (type === 'message' && dropFinal && JSON.parse(String(event.data)).t === 'run.result') { dropFinal = false; dropped = true; socket.terminate(); return; }
        callback(event);
      }); },
    };
  });
  clients.push(player);
  await player.connect(async () => bearer);
  await t.chain.flush();
  await waitFor(() => player.status === 'countdown', 'countdown');
  const session = t.ctx.runs.get(run.runId);
  expect(player.runner.sim.seed).toBe(session.seed);
  if (mode === 'event') expect(player.params.seed).not.toBe(run.seed);
  const viewer = new WatchClient(base.replace('http:', 'ws:'), room.code, 'FE integration', t.clock.now, socketAt);
  clients.push(viewer); viewer.connect(); await waitFor(() => viewer.status === 'ready', 'public viewer');
  expect((await roomApi.read(room.code)).spectators).toBe(1);
  t.clock.set(session.startAt); player.pump();
  const ap = new Autopilot(); let interrupted = false, reconnectAt = null, sent = false;
  for (let step = 0; player.runner.phase !== 'ended'; step++) {
    if (step > 3200) throw Error('FE run did not end');
    for (const kind of ap.decide(player.runner.current, 0)) player.input(kind);
    t.clock.set(session.startAt + Math.ceil((step + 1) * 1000 / 30)); player.pump(); t.ctx.rooms.tickEnergy();
    await pause();
    if (!sent && step > 60 && viewer.canSend('NITRO')) { expect(viewer.send({ kind: 'NITRO' })).toBe(true); sent = true; }
    if (!interrupted && step === 90) { playSockets.at(-1).terminate(); await waitFor(() => player.status === 'disconnected', 'outage'); interrupted = true; reconnectAt = step + 90; }
    if (reconnectAt === step) { await player.connect(async () => bearer); await waitFor(() => player.status === 'running', 'resume'); reconnectAt = null; }
    if (step % 15 === 0) await t.chain.flush();
    if (player.status === 'error' || player.status === 'expired') throw Error(player.error + ' frames=' + JSON.stringify(frames));
  }
  await waitFor(() => !dropFinal && player.status === 'disconnected', 'terminal response lost in transport').catch(error=>{throw Error(error.message+' '+JSON.stringify({dropFinal,status:player.status,localTick:player.runner.current.tick,serverTick:session.sim.tick,lifecycle:session.lifecycle,watermark:session.watermark,flags:session.flags,frames}));});
  await player.connect(async () => bearer); await waitFor(() => player.result !== null, 'terminal replay');
  while (t.chain.relayer.queueSize() > 0) await t.chain.flush();
  await waitFor(() => player.recorded.size === player.result.nearMisses && viewer.result !== null, 'receipts and public result');
  const summary = await createSummaryApi(base).read(run.runId);
  expect(player.result.status).toBe('VERIFIED'); expect(summary.result).toBe('VERIFIED');
  expect(summary.finalHash).toBe(player.runner.sim.inputHash); expect(summary.seed).toBe(player.params.seed);
  expect(summary.nearMisses).toBe(player.runner.current.nearMisses); expect(summary.nearMisses).toBeGreaterThan(0);
  expect(player.verified.size).toBe(summary.nearMisses); expect(sent).toBe(true); expect(interrupted).toBe(true);
  expect(viewer.scheduled.size).toBeGreaterThan(0); expect(viewer.error).toBeNull();
}, 60000);

it('denies invalid tokens and another user starting a host room without mutating runs', async () => {
  const api = createAuthApi(base);
  await expect(api.me(await token('did:privy:integration-a', 'wrong-app'))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(providerCalls).toHaveLength(0);
  const anonymous = await fetch(base + '/rooms', { method: 'POST' }); expect(anonymous.status).toBe(401);
  const bearer = await token(); const other = await token('did:privy:integration-b');
  const room = await createRoomApi(base).create(bearer);
  const before = t.db.select().from(runs).all();
  await expect(createRunApi(base).create({ carTier: 0, roomCode: room.code }, other)).rejects.toMatchObject({ code: 'NOT_ROOM_HOST' });
  expect(t.db.select().from(runs).all()).toEqual(before);
  expect((await createRoomApi(base).read(room.code)).run).toBeNull();
});

it('roundtrips a real signed mock voucher, isolates buyer and releases expired reservation without a purchase', async () => {
  const bearer = await token(); const other = await token('did:privy:integration-b');
  await createAuthApi(base).me(bearer); await createAuthApi(base).me(other);
  t.chain.qualified.set(`${A}:1`, `0x${'aa'.repeat(32)}`); addLedgerEntry(t.db, A, 5000, 'integration-fixture', t.clock.now());
  const api = createVoucherApi(base, fetch, t.clock.now);
  const first = await api.create(1, A, async () => bearer); const again = await api.create(1, A, async () => bearer);
  expect(again).toEqual(first); expect(t.db.select().from(reservations).all()).toHaveLength(1);
  const forged = await fetch(base + '/vouchers', { method: 'POST', headers: { Authorization: `Bearer ${other}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ tier: 1, buyer: A }) });
  expect(forged.status).toBe(403); expect(t.db.select().from(reservations).all()).toHaveLength(1);
  t.clock.set(first.expiresAt + 1);
  const next = await api.create(1, A, async () => bearer); expect(next.voucher.nonce).not.toBe(first.voucher.nonce);
  const me = await createAuthApi(base).me(bearer); expect(me.coins).toBe(5000); expect(me.coinsReserved).toBe(3000); expect(me.ownedTiers).not.toContain(1);
});

it('reconciles a lost POST /runs through the FE lookup, adopts it once, and blocks a second tab', async () => {
  const bearer = await token(); const other = await token('did:privy:integration-b');
  const lossy = async (url, init) => { await fetch(url, init); throw Error('response lost'); };
  await expect(createRunApi(base, lossy).create({ carTier: 0 }, bearer)).rejects.toMatchObject({ code: 'UNKNOWN_OUTCOME' });
  expect(t.db.select().from(runs).all()).toHaveLength(1);
  await expect(createRunApi(base).create({ carTier: 0 }, bearer)).rejects.toMatchObject({ code: 'ACTIVE_RUN_EXISTS' });
  expect(t.db.select().from(runs).all()).toHaveLength(1);
  expect(await createRunApi(base).active(other)).toEqual({ run: null, creating: false });
  const { run } = await createRunApi(base).active(bearer);
  expect(run).toMatchObject({ lifecycle: 'CREATED', controlled: false });
  const ws = base.replace('http:', 'ws:') + '/ws/play';
  const tabA = new PlayClient({ runId: run.runId, seed: run.seed, carTier: run.carTier }, ws, t.clock.now, socketAt); clients.push(tabA);
  await tabA.connect(async () => bearer);
  await waitFor(() => tabA.status === 'countdown', 'adopted run countdown');
  expect((await createRunApi(base).active(bearer)).run.controlled).toBe(true);
  const tabB = new PlayClient({ runId: run.runId, seed: run.seed, carTier: run.carTier }, ws, t.clock.now, socketAt); clients.push(tabB);
  await tabB.connect(async () => bearer);
  await waitFor(() => tabB.status === 'error', 'second tab rejected');
  expect(tabB.error).toContain('another tab or device');
  const session = t.ctx.runs.get(run.runId);
  t.clock.set(session.startAt); tabA.pump();
  const ap = new Autopilot();
  for (let step = 0; tabA.runner.phase !== 'ended'; step++) {
    if (step > 3200) throw Error('run did not end');
    for (const kind of ap.decide(tabA.runner.current, 0)) tabA.input(kind);
    t.clock.set(session.startAt + Math.ceil((step + 1) * 1000 / 30)); tabA.pump(); await pause();
    expect(tabA.status).not.toBe('error');
  }
  await waitFor(() => tabA.result !== null, 'result');
  const summary = await createSummaryApi(base).read(run.runId);
  expect(tabA.result.status).toBe('VERIFIED'); expect(summary.finalHash).toBe(tabA.runner.sim.inputHash);
  expect(t.db.select().from(runs).all()).toHaveLength(1);
}, 60000);
