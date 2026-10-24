// Indexer terhadap RPC tiruan: rentang getLogs hanya dibelah kalau RPC menolak rentangnya,
// bukan karena rate limit (uji testnet 24 Okt: rentang menyusut permanen → event tercatat 10–37 dtk terlambat).
import { describe, expect, it } from 'vitest';
import { BaseError, type PublicClient } from 'viem';
import { ChainBus } from '../src/chain/bus';
import { Indexer, isTransient, memoryCursorStore } from '../src/chain/indexer';
import { silentLog } from '../src/chain/log';

const REGISTRY = '0x1111111111111111111111111111111111111111';
const NFT = '0x2222222222222222222222222222222222222222';

/** RPC tiruan: `fail(span, call)` mengembalikan error untuk panggilan getLogs ke-`call`, atau undefined kalau berhasil. */
function fakeClient(latest: bigint, fail: (span: bigint, call: number) => Error | undefined) {
  const spans: bigint[] = [];
  const client = {
    getBlockNumber: async () => latest,
    getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
      const span = toBlock - fromBlock + 1n;
      spans.push(span);
      const err = fail(span, spans.length);
      if (err) throw err;
      return [];
    },
  } as unknown as PublicClient;
  return { client, spans };
}

const indexer = (client: PublicClient, startBlock: bigint) =>
  new Indexer({ publicClient: client, registry: REGISTRY, carNFT: NFT, bus: new ChainBus(), cursor: memoryCursorStore(), startBlock, log: silentLog });

describe('indexer: rentang getLogs', () => {
  it('rate limit tidak mengecilkan rentang; putaran berikutnya tetap 1000 blok', async () => {
    const limited = new BaseError('RPC Request failed.', { details: 'requests limited to 15/sec' });
    const { client, spans } = fakeClient(2999n, (_, call) => (call === 1 ? limited : undefined));
    const ix = indexer(client, 1000n);

    await expect(ix.sync()).rejects.toThrow(/requests limited/);
    await ix.sync();
    expect(spans).toEqual([1000n, 1000n, 1000n]);
  });

  it('RPC yang membatasi rentang (QuickNode Discover: 5 blok) dibelah sampai lolos, tidak menyerah di 10', async () => {
    const tooWide = new BaseError('RPC Request failed.', { details: 'eth_getLogs is limited to a 5 range' });
    const { client, spans } = fakeClient(1019n, (span) => (span > 5n ? tooWide : undefined));
    const ix = indexer(client, 1000n);

    await ix.sync();
    expect(spans.filter((s) => s <= 5n).reduce((a, b) => a + b, 0n)).toBe(20n);
    expect(spans.at(-1)).toBeLessThanOrEqual(5n);
  });

  it('isTransient: rate limit dan gangguan jaringan ya, penolakan rentang tidak', () => {
    expect(isTransient(new Error('RPC Request failed.\n\nDetails: requests limited to 15/sec'))).toBe(true);
    expect(isTransient(new Error('HTTP request failed.\n\nStatus: 429'))).toBe(true);
    expect(isTransient(new Error('The request took too long to respond.'))).toBe(true);
    expect(isTransient(new Error('HTTP request failed.\n\nDetails: eth_getLogs is limited to a 5 range'))).toBe(false);
    expect(isTransient(new Error('query returned more than 10000 results'))).toBe(false);
  });
});
