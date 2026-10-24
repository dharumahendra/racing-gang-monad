import type { Address, Hex } from '@racing-gang/config/protocol';
import type { Db } from '../db/client';
import type { Env } from '../env';
import { createLiveChain } from './live';
import { MockChain } from './mock';
import type { Chain } from './ports';

/** `db` dipakai mode live untuk menyimpan cursor indexer (tabel chain_cursor). */
export function createChain(env: Env, now?: () => number, db?: Db): Chain {
  if (env.CHAIN_MODE === 'live') return createLiveChain(env, { db });
  return new MockChain({
    chainId: env.CHAIN_ID,
    now,
    voucherSignerKey: env.VOUCHER_SIGNER_PRIVATE_KEY as Hex | undefined,
    carNFT: env.CAR_NFT_ADDRESS as Address | undefined,
  });
}

export type { Chain } from './ports';
