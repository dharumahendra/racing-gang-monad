import type { Address, Hex } from '@racing-gang/config/protocol';
import type { Env } from '../env';
import { createLiveChain } from './live';
import { MockChain } from './mock';
import type { Chain } from './ports';

export function createChain(env: Env, now?: () => number): Chain {
  if (env.CHAIN_MODE === 'live') return createLiveChain(env);
  return new MockChain({
    chainId: env.CHAIN_ID,
    now,
    voucherSignerKey: env.VOUCHER_SIGNER_PRIVATE_KEY as Hex | undefined,
    carNFT: env.CAR_NFT_ADDRESS as Address | undefined,
  });
}

export type { Chain } from './ports';
