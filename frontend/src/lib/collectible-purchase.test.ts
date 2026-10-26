import { describe, expect, it, vi } from 'vitest';
import { getCollectiblesDeployment } from '@racing-gang/config';
import { decodeFunctionData } from 'viem';
import { CollectiblePurchase, buildCollectibleCall, collectiblesAbiProblems, type CollectibleDeps } from './collectible-purchase';

const account = '0x1111111111111111111111111111111111111111' as const;
const other = '0x2222222222222222222222222222222222222222' as const;
const hash = `0x${'ab'.repeat(32)}` as const;
const deployment = getCollectiblesDeployment()!;
const price = 50_000_000_000_000_000n;

function setup() {
  const saved = new Map<string, string>();
  let owned = false;
  const deps: CollectibleDeps = {
    chainId: 10143, contract: deployment.collectibles, address: account, design: 2,
    store: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => { saved.set(key, value); }, removeItem: key => { saved.delete(key); } },
    build: value => buildCollectibleCall(deployment, 2, value),
    wallet: {
      address: vi.fn(() => account), switchChain: vi.fn(async () => {}),
      balance: vi.fn(async () => 10n ** 18n), send: vi.fn(async () => hash),
    },
    chain: {
      read: vi.fn(async () => ({ price, supply: 100n, minted: 0n, owned })),
      prepare: vi.fn(async () => ({ gas: 110_000n, gasCost: 10n ** 15n })),
      receipt: vi.fn(async () => { owned = true; return 'success' as const; }),
    },
  };
  return { deps, saved, setOwned: (value: boolean) => { owned = value; }, flow: new CollectiblePurchase(deps) };
}

describe('pembelian koleksi RGX', () => {
  it('memakai ABI deploy buy(uint8), desain Burger 2 dan MON persis dari chain', () => {
    expect(collectiblesAbiProblems(deployment.abi)).toEqual([]);
    const call = buildCollectibleCall(deployment, 2, price);
    expect(call.to).toBe(deployment.collectibles);
    expect(call.value).toBe(price);
    expect(decodeFunctionData({ abi: deployment.abi as any, data: call.data })).toMatchObject({ functionName: 'buy', args: [2] });
    expect(() => buildCollectibleCall({ ...deployment, abi: [] }, 2, price)).toThrow();
    expect(() => buildCollectibleCall(deployment, 4, price)).toThrow();
  });

  it('klik ganda hanya mengirim sekali, owned menunggu receipt dan pembacaan chain', async () => {
    const h = setup();
    let finish!: (value: 'success') => void;
    h.deps.chain.receipt = vi.fn(() => new Promise<'success' | 'reverted'>(resolve => { finish = resolve; }));
    const first = h.flow.buy();
    await h.flow.buy();
    await vi.waitFor(() => expect(h.flow.state.step).toBe('pending'));
    expect(h.deps.wallet.send).toHaveBeenCalledTimes(1);
    expect(h.saved.size).toBe(1);
    h.setOwned(true); finish('success'); await first;
    expect(h.flow.state.step).toBe('done');
    expect(h.saved.size).toBe(0);
  });

  it('wallet yang berbeda diblokir sebelum switch/simulasi/transaksi', async () => {
    const h = setup(); h.deps.wallet.address = () => other;
    await h.flow.buy();
    expect(h.flow.state.step).toBe('error');
    expect(h.deps.wallet.switchChain).not.toHaveBeenCalled();
    expect(h.deps.wallet.send).not.toHaveBeenCalled();
  });

  it('saldo harus menutupi harga plus gas sebelum wallet diminta konfirmasi', async () => {
    const h = setup(); h.deps.wallet.balance = async () => price;
    await h.flow.buy();
    expect(h.flow.state).toMatchObject({ step: 'error', message: expect.stringContaining('MON') });
    expect(h.deps.wallet.send).not.toHaveBeenCalled();
  });

  it('owned dan sold out tidak sampai mengirim transaksi', async () => {
    const owned = setup(); owned.setOwned(true); await owned.flow.buy();
    expect(owned.flow.state.step).toBe('done');
    expect(owned.deps.wallet.send).not.toHaveBeenCalled();
    const full = setup(); full.deps.chain.read = async () => ({ price, supply: 100n, minted: 100n, owned: false });
    await full.flow.buy();
    expect(full.flow.state).toMatchObject({ step: 'error', message: expect.stringContaining('sold out') });
    expect(full.deps.wallet.send).not.toHaveBeenCalled();
  });

  it('ganti jaringan ditolak dan simulasi revert berhenti sebelum transaksi', async () => {
    const rejected = setup(); rejected.deps.wallet.switchChain = async () => { throw { code: 4001 }; };
    await rejected.flow.buy(); expect(rejected.flow.state.step).toBe('error');
    expect(rejected.deps.wallet.send).not.toHaveBeenCalled();
    const revert = setup(); revert.deps.chain.prepare = async () => { throw new Error('SoldOut'); };
    await revert.flow.buy(); expect(revert.flow.state.step).toBe('error');
    expect(revert.deps.wallet.send).not.toHaveBeenCalled();
  });

  it('penolakan wallet menghapus marker tanpa mencoba ulang otomatis', async () => {
    const h = setup(); h.deps.wallet.send = vi.fn(async () => { throw { code: 4001 }; });
    await h.flow.buy();
    expect(h.flow.state.step).toBe('error'); expect(h.saved.size).toBe(0);
    expect(h.deps.wallet.send).toHaveBeenCalledTimes(1);
  });

  it('hasil kirim ambigu bertahan setelah reload dan check tidak mengirim ulang', async () => {
    const h = setup(); h.deps.wallet.send = vi.fn(async () => { throw new Error('network lost'); });
    await h.flow.buy(); expect(h.flow.state.step).toBe('unknown');
    const reload = new CollectiblePurchase(h.deps);
    await reload.resume(); await reload.buy(); await reload.check();
    expect(reload.state.step).toBe('unknown');
    expect(h.deps.wallet.send).toHaveBeenCalledTimes(1);
    h.setOwned(true); await reload.check();
    expect(reload.state.step).toBe('done'); expect(h.saved.size).toBe(0);
  });

  it('hash pending dilanjutkan setelah reload tanpa prompt wallet kedua', async () => {
    const h = setup(); h.deps.chain.receipt = vi.fn(async () => { throw new Error('timeout'); });
    await h.flow.buy(); expect(h.flow.state).toMatchObject({ step: 'unknown', hash });
    h.deps.chain.receipt = vi.fn(async () => { h.setOwned(true); return 'success' as const; });
    const reload = new CollectiblePurchase(h.deps); await reload.resume();
    expect(reload.state.step).toBe('done');
    expect(h.deps.wallet.send).toHaveBeenCalledTimes(1);
  });

  it('request jaringan dibatalkan tidak dianggap penolakan wallet yang pasti', async () => {
    const h = setup(); h.deps.wallet.send = vi.fn(async () => { throw new Error('request canceled after connection lost'); });
    await h.flow.buy();
    expect(h.flow.state.step).toBe('unknown');
    const reload = new CollectiblePurchase(h.deps); await reload.resume(); await reload.buy();
    expect(h.deps.wallet.send).toHaveBeenCalledTimes(1);
  });

  it('hash wallet tidak valid tetap dianggap ambigu saat reload', async () => {
    const h = setup(); h.deps.wallet.send = vi.fn(async () => '0x' as typeof hash);
    await h.flow.buy(); expect(h.flow.state.step).toBe('unknown');
    const reload = new CollectiblePurchase(h.deps); await reload.resume(); await reload.buy();
    expect(reload.state.step).toBe('unknown'); expect(h.deps.wallet.send).toHaveBeenCalledTimes(1);
  });

  it('receipt sukses tanpa bukti ownsDesign tidak diberi label Owned', async () => {
    const h = setup(); h.deps.chain.receipt = async () => 'success';
    await h.flow.buy(); expect(h.flow.state.step).toBe('unknown');
    expect(h.saved.size).toBe(1);
  });

  it('revert on-chain dibedakan dari sukses dan boleh dicoba lagi secara manual', async () => {
    const h = setup(); h.deps.chain.receipt = async () => 'reverted';
    await h.flow.buy();
    expect(h.flow.state).toMatchObject({ step: 'error', retry: true });
    expect(h.saved.size).toBe(0);
  });

  it('ganti akun mengabaikan hasil lama tetapi hash akun A tetap tersimpan', async () => {
    const h = setup(); let release!: (value: typeof hash) => void;
    h.deps.wallet.send = vi.fn(() => new Promise<typeof hash>(resolve => { release = resolve; }));
    const pending = h.flow.buy();
    await vi.waitFor(() => expect(h.deps.wallet.send).toHaveBeenCalledTimes(1));
    h.flow.dispose(); release(hash); await pending;
    expect(h.flow.state.step).not.toBe('done');
    const b = new CollectiblePurchase({ ...h.deps, address: other }); await b.resume();
    expect(b.state.step).toBe('idle'); expect(h.saved.size).toBe(1);
  });

  it('tanpa penyimpanan recovery, transaksi tidak dikirim', async () => {
    const h = setup(); h.deps.store = null;
    await h.flow.buy();
    expect(h.flow.state.step).toBe('error'); expect(h.deps.wallet.send).not.toHaveBeenCalled();
  });

  it('resume dapat dipasang ulang setelah cleanup React tanpa tertahan status checking lama', async () => {
    const h = setup(); h.deps.chain.receipt = async () => { throw new Error('timeout'); };
    await h.flow.buy();
    const normalRead = h.deps.chain.read;
    let release!: (value: Awaited<ReturnType<typeof normalRead>>) => void;
    h.deps.chain.read = () => new Promise(resolve => { release = resolve; });
    const stale = h.flow.resume();
    h.flow.dispose(); h.deps.chain.read = normalRead; h.setOwned(true);
    await h.flow.resume();
    release({ price, supply: 100n, minted: 0n, owned: false }); await stale;
    expect(h.flow.state.step).toBe('done');
    expect(h.deps.wallet.send).toHaveBeenCalledTimes(1);
  });
});
