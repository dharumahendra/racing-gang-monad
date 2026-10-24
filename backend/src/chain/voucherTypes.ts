// EIP-712 voucher (TECH_SPEC §6.3). Dipakai signer mock dan live supaya domain dan type selalu sama.
import type { Address } from '@racing-gang/config/protocol';

export const voucherDomain = (chainId: number, carNFT: Address) =>
  ({ name: 'RacingGangCars', version: '1', chainId, verifyingContract: carNFT }) as const;

export const voucherTypes = {
  Voucher: [
    { name: 'buyer', type: 'address' },
    { name: 'tier', type: 'uint8' },
    { name: 'coinCost', type: 'uint32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint64' },
  ],
} as const;
