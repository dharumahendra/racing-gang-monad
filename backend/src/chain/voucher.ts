// Voucher signer live (TECH_SPEC §6.3, §7.3, TASKS CH-3). Kunci ini berbeda dari kunci attester.
import type { Address, Hex } from '@racing-gang/config/protocol';
import { privateKeyToAccount } from 'viem/accounts';
import type { VoucherMessage, VoucherSigner } from './ports';
import { voucherDomain, voucherTypes } from './voucherTypes';

export function createVoucherSigner(privateKey: Hex, chainId: number, carNFT: Address): VoucherSigner {
  const account = privateKeyToAccount(privateKey);
  const domain = voucherDomain(chainId, carNFT);
  return {
    address: account.address,
    sign: (v: VoucherMessage) => account.signTypedData({ domain, types: voucherTypes, primaryType: 'Voucher', message: v }),
  };
}
