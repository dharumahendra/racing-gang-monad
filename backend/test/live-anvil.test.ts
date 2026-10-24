// Uji relayer, indexer, dan voucher signer live terhadap kontrak sungguhan di anvil lokal.
// Butuh `anvil` di PATH dan artifact `forge build` di contract/out; kalau tidak ada, dilewati.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CARS } from '@racing-gang/config';
import type { Address, Hex } from '@racing-gang/config/protocol';
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Abi,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { carNftAbi } from '../src/chain/abi';
import { ChainBus } from '../src/chain/bus';
import { Indexer, memoryCursorStore, type CursorStore } from '../src/chain/indexer';
import { silentLog } from '../src/chain/log';
import type { ChainEvent, NearMissRec } from '../src/chain/ports';
import { Relayer } from '../src/chain/relayer';
import { computeRunId, computeSeed } from '../src/chain/seed';
import { createVoucherSigner } from '../src/chain/voucher';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../contract/out');
const artifactPath = (name: string) => resolve(outDir, `${name}.sol/${name}.json`);
const hasAnvil = spawnSync('anvil', ['--version']).status === 0;
const hasArtifacts = existsSync(artifactPath('RunRegistry')) && existsSync(artifactPath('CarNFT'));

// Akun bawaan anvil (kunci publik, hanya untuk lokal).
const KEYS = {
  deployer: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  attester: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  voucher: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  player: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
} as const satisfies Record<string, Hex>;

const PORT = 8547;
const RPC = `http://127.0.0.1:${PORT}`;
const chain = defineChain({
  id: 31337,
  name: 'anvil',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const ZERO_HASH = `0x${'00'.repeat(32)}` as Hex;

describe.skipIf(!hasAnvil || !hasArtifacts)('chain live di anvil', { timeout: 60_000 }, () => {
  let anvil: ChildProcess;
  // Cache sengaja panjang agar pembacaan seed/cursor terbukti memakai blok terbaru.
  const publicClient = createPublicClient({ chain, transport: http(RPC), pollingInterval: 50, cacheTime: 60_000 }) as PublicClient;
  const testClient = createTestClient({ chain, mode: 'anvil', transport: http(RPC) });
  const deployer = createWalletClient({ chain, transport: http(RPC), account: privateKeyToAccount(KEYS.deployer) });
  const attester = createWalletClient({ chain, transport: http(RPC), account: privateKeyToAccount(KEYS.attester) });
  const playerWallet = createWalletClient({ chain, transport: http(RPC), account: privateKeyToAccount(KEYS.player) });
  const player = playerWallet.account.address;

  let registry: Address;
  let carNFT: Address;
  let bus: ChainBus;
  let events: ChainEvent[];
  let relayer: Relayer;
  let cursor: CursorStore;
  let indexer: Indexer;
  let nonce = 0n;

  async function deploy(name: string, args: unknown[]): Promise<Address> {
    const art = JSON.parse(readFileSync(artifactPath(name), 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
    const hash = await deployer.deployContract({ abi: art.abi, bytecode: art.bytecode.object, args });
    return (await publicClient.waitForTransactionReceipt({ hash })).contractAddress!;
  }

  beforeAll(async () => {
    anvil = spawn('anvil', ['--port', String(PORT), '--silent'], { stdio: 'ignore' });
    for (let i = 0; i < 50; i++) {
      try {
        await publicClient.getChainId();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    registry = await deploy('RunRegistry', [attester.account.address, CARS.map((c) => c.reqNearMiss), CARS.map((c) => c.minCarTier)]);
    carNFT = await deploy('CarNFT', [
      registry,
      privateKeyToAccount(KEYS.voucher).address,
      CARS.map((c) => parseEther(c.priceMon)),
      CARS.map((c) => BigInt(c.supply)),
      'https://racing.gang/cars/',
    ]);
    const hash = await deployer.writeContract({
      address: registry,
      abi: [{ type: 'function', name: 'setCarNFT', inputs: [{ name: 'c', type: 'address' }], outputs: [], stateMutability: 'nonpayable' }],
      functionName: 'setCarNFT',
      args: [carNFT],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    await testClient.mine({ blocks: 5 });
  });

  afterAll(() => {
    anvil?.kill();
  });

  beforeEach(async () => {
    bus = new ChainBus();
    events = [];
    bus.on((e) => void events.push(e));
    relayer = new Relayer({ publicClient, walletClient: attester, registry, bus, log: silentLog });
    cursor = memoryCursorStore();
    // Mulai setelah blok terakhir supaya event dari test sebelumnya tidak ikut terbaca.
    const startBlock = (await publicClient.getBlockNumber({ cacheTime: 0 })) + 1n;
    indexer = new Indexer({ publicClient, registry, carNFT, bus, cursor, startBlock, log: silentLog });
  });

  const newRunId = () => computeRunId(player, ++nonce);
  const seedBlock = async () => (await publicClient.getBlockNumber({ cacheTime: 0 })) - 3n;
  const nm = (runId: Hex, index: number): NearMissRec => ({ runId, index, tick: index * 10, vehicleType: index % 5 === 0 ? 1 : 0, vehicleId: index, inputHash: ZERO_HASH });
  const drain = async () => {
    for (let i = 0; i < 20 && relayer.queueSize() > 0; i++) await relayer.flush();
    await indexer.sync();
  };
  const of = <T extends ChainEvent['type']>(type: T) => events.filter((e): e is Extract<ChainEvent, { type: T }> => e.type === type);

  it('seedBlock mengikuti blok yang baru ditambang meskipun cache blok masih hangat', async () => {
    const before = await publicClient.getBlockNumber({ cacheTime: 0 });
    await testClient.mine({ blocks: 1 });
    expect(await seedBlock()).toBe(before + 1n - 3n);
  });

  it('run penuh: seed sesuai rumus, mepet urut walau masuk acak dan dobel, Qualified di mepet ke-40, RunEnded', async () => {
    const runId = newRunId();
    const sb = await seedBlock();
    relayer.enqueueStart({ runId, player, carTier: 0, seedBlock: sb, configVersion: 1 });
    relayer.enqueueEnd({ runId, reason: 0, endTick: 3000, totalNearMisses: 40, finalInputHash: ZERO_HASH });
    for (let i = 40; i >= 1; i--) relayer.enqueueNearMiss(nm(runId, i));
    relayer.enqueueNearMiss(nm(runId, 7));
    await drain();

    expect(relayer.queueSize()).toBe(0);
    const blockHash = (await publicClient.getBlock({ blockNumber: sb })).hash!;
    expect(of('RunStarted')).toEqual([expect.objectContaining({ runId, player, seed: computeSeed(blockHash, runId, player) })]);
    expect(of('NearMiss').map((e) => e.index)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(of('NearMiss')[4]).toMatchObject({ vehicleType: 1, tick: 50 });
    expect(of('Qualified')).toEqual([expect.objectContaining({ player, tier: 1, runId, tick: 400 })]);
    expect(of('RunEnded')).toEqual([expect.objectContaining({ runId })]);
    expect(of('RecordFailed')).toEqual([]);
  });

  it('batch dibatasi maxBatchNearMiss (60): 70 mepet butuh dua transaksi', async () => {
    const runId = newRunId();
    relayer.enqueueStart({ runId, player, carTier: 0, seedBlock: await seedBlock(), configVersion: 1 });
    for (let i = 1; i <= 70; i++) relayer.enqueueNearMiss(nm(runId, i));
    await relayer.flush();
    expect(relayer.queueSize()).toBe(10);
    await drain();
    expect(of('NearMiss')).toHaveLength(70);
  });

  it('setelah restart: relayer baru membaca getRun, membuang duplikat, lalu melanjutkan', async () => {
    const runId = newRunId();
    relayer.enqueueStart({ runId, player, carTier: 0, seedBlock: await seedBlock(), configVersion: 1 });
    for (let i = 1; i <= 5; i++) relayer.enqueueNearMiss(nm(runId, i));
    await drain();

    const fresh = new Relayer({ publicClient, walletClient: attester, registry, bus, log: silentLog });
    for (let i = 1; i <= 8; i++) fresh.enqueueNearMiss(nm(runId, i));
    fresh.enqueueEnd({ runId, reason: 3, endTick: 80, totalNearMisses: 8, finalInputHash: ZERO_HASH });
    for (let i = 0; i < 5 && fresh.queueSize() > 0; i++) await fresh.flush();
    await indexer.sync();

    expect(fresh.queueSize()).toBe(0);
    expect(of('NearMiss').map((e) => e.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(of('RunEnded')).toHaveLength(1);
  });

  it('record bermasalah diisolasi: seedBlock kedaluwarsa → RecordFailed, run lain di batch yang sama tetap tercatat', async () => {
    const bad = newRunId();
    const badSeed = await seedBlock();
    await testClient.mine({ blocks: 300 });
    const good = newRunId();
    relayer.enqueueStart({ runId: bad, player, carTier: 0, seedBlock: badSeed, configVersion: 1 });
    relayer.enqueueNearMiss(nm(bad, 1));
    relayer.enqueueStart({ runId: good, player, carTier: 0, seedBlock: await seedBlock(), configVersion: 1 });
    relayer.enqueueNearMiss(nm(good, 1));
    await drain();

    expect(events.filter((e) => e.type === 'RecordFailed')).toEqual([{ type: 'RecordFailed', runId: bad, error: 'SeedBlockInvalid' }]);
    expect(of('RunStarted').map((e) => e.runId)).toEqual([good]);
    expect(of('NearMiss').map((e) => e.runId)).toEqual([good]);
    expect(relayer.queueSize()).toBe(0);

    relayer.enqueueNearMiss(nm(bad, 2)); // record baru untuk run yang sudah gagal diabaikan
    expect(relayer.queueSize()).toBe(0);
  });

  it('mobil yang tidak dimiliki → RecordFailed CarNotOwned', async () => {
    const runId = newRunId();
    relayer.enqueueStart({ runId, player, carTier: 2, seedBlock: await seedBlock(), configVersion: 1 });
    await drain();
    expect(of('RecordFailed')).toEqual([{ type: 'RecordFailed', runId, error: 'CarNotOwned' }]);
  });

  it('voucher dari signer live diterima CarNFT.buy(); indexer memancarkan Purchased', async () => {
    // Pemain sudah lulus Tier 1 dari test pertama.
    const signer = createVoucherSigner(KEYS.voucher, chain.id, carNFT);
    const v = { buyer: player, tier: 1, coinCost: 3000, nonce: 777n, expiry: BigInt(Math.floor(Date.now() / 1000) + 600) };
    const sig = await signer.sign(v);
    const hash = await playerWallet.writeContract({ address: carNFT, abi: carNftAbi, functionName: 'buy', args: [v, sig], value: parseEther(CARS[1].priceMon) });
    expect((await publicClient.waitForTransactionReceipt({ hash })).status).toBe('success');
    await indexer.sync();

    expect(of('Purchased')).toEqual([
      expect.objectContaining({ buyer: player, tier: 1, tokenId: 1n, voucherNonce: 777n, coinCost: 3000, txHash: hash }),
    ]);
    expect(await publicClient.readContract({ address: carNFT, abi: carNftAbi, functionName: 'ownsTier', args: [player, 1] })).toBe(true);
  });

  it('cursor: indexer baru dengan cursor yang sama tidak memancarkan ulang event lama', async () => {
    const runId = newRunId();
    relayer.enqueueStart({ runId, player, carTier: 0, seedBlock: await seedBlock(), configVersion: 1 });
    await drain();
    expect(of('RunStarted')).toHaveLength(1);

    const again = new Indexer({ publicClient, registry, carNFT, bus, cursor, log: silentLog });
    await again.sync();
    expect(of('RunStarted')).toHaveLength(1);
  });
});
