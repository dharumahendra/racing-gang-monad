import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { CARS } from '@racing-gang/config';
import { session } from './auth-runtime';

/**
 * Mobil pilihan pemain. Disimpan per alamat akun (ganti akun tidak mewarisi pilihan akun lain) dan selalu
 * divalidasi terhadap kepemilikan dari /me: mobil yang tidak dimiliki jatuh ke Starter. Ini preferensi UI;
 * server tetap memeriksa kepemilikan saat POST /runs, jadi pilihan palsu di storage tidak membuka mobil.
 */
const keyFor = (address: string) => `racing-gang:selected-tier:${address.toLowerCase()}`;
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'> | null;
const storage = (): Storage => { try { return window.localStorage; } catch { return null; } };

export function resolveSelectedTier(stored: unknown, ownedTiers: readonly number[] | undefined): number {
  const tier = Number(stored);
  if (!Number.isInteger(tier) || !CARS[tier] || tier === 0) return 0;
  return ownedTiers?.includes(tier) ? tier : 0;
}
export function readSelectedTier(address: string | undefined, ownedTiers: readonly number[] | undefined, store: Storage = storage()) {
  if (!address) return 0;
  try { return resolveSelectedTier(store?.getItem(keyFor(address)), ownedTiers); } catch { return 0; }
}
export function saveSelectedTier(address: string, tier: number, store: Storage = storage()) {
  try { store?.setItem(keyFor(address), String(tier)); } catch { /* storage diblokir: pilihan hanya berlaku sampai reload */ }
}

const listeners = new Set<() => void>();
/** Mobil aktif untuk akun yang sedang login (0 = Starter bila belum login / belum memiliki). */
export function useSelectedCar() {
  const account = useStore(session, (s) => s.account);
  const address = account?.address, owned = account?.ownedTiers;
  const [tier, setTier] = useState(() => readSelectedTier(address, owned));
  useEffect(() => {
    const sync = () => setTier(readSelectedTier(address, owned));
    sync(); listeners.add(sync);
    const onStorage = (e: StorageEvent) => { if (!address || e.key === null || e.key === keyFor(address)) sync(); };
    window.addEventListener('storage', onStorage);
    return () => { listeners.delete(sync); window.removeEventListener('storage', onStorage); };
  }, [address, owned]);
  const select = (next: number) => {
    if (!address || resolveSelectedTier(next, owned) !== next) return false;
    saveSelectedTier(address, next);
    for (const l of listeners) l();
    return true;
  };
  return { tier, select, canSelect: (t: number) => t === 0 || !!owned?.includes(t), signedIn: !!address };
}
