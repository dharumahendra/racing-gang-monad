// Kepemilikan mobil khusus pengembangan (CHAIN_MODE=mock, bukan production).
// DEV_GRANT_TIERS="0xAlamat:1,0xAlamat:3" → saat start, alamat itu tercatat memiliki tier tersebut di DB dan di
// MockChain (dipakai /me dan cek kepemilikan POST /runs). Bukan pembelian: tidak memotong koin, tidak membuat voucher,
// tidak menandai lulus syarat. Ditolak env.ts untuk chain live atau production, jadi tidak bisa bocor ke demo nyata.
import { getAddress, isAddress } from 'viem';
import { CARS } from '@racing-gang/config';
import type { Address } from '@racing-gang/config/protocol';
import type { Db } from './db/client';
import { ownedCars } from './db/schema';
import type { MockChain } from './chain/mock';

export const DEV_GRANT_MARK = 'dev-grant';

export function parseDevGrants(raw: string | undefined): { address: Address; tier: number }[] {
  if (!raw?.trim()) return [];
  return raw.split(',').map((part) => {
    const [addr, tierText] = part.trim().split(':');
    const tier = Number(tierText);
    if (!addr || !isAddress(addr, { strict: false })) throw new Error(`DEV_GRANT_TIERS: alamat tidak valid "${part}"`);
    if (!Number.isInteger(tier) || tier < 1 || !CARS[tier]) throw new Error(`DEV_GRANT_TIERS: tier tidak valid "${part}"`);
    return { address: getAddress(addr), tier };
  });
}

export function applyDevGrants(db: Db, chain: MockChain, grants: { address: Address; tier: number }[]) {
  for (const { address, tier } of grants) {
    db.insert(ownedCars)
      .values({ address, tier, tokenId: DEV_GRANT_MARK, runId: DEV_GRANT_MARK, txHash: DEV_GRANT_MARK })
      .onConflictDoNothing()
      .run();
    chain.owned.add(`${address}:${tier}`);
  }
  return grants.length;
}
