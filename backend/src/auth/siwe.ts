// Verifikasi Sign-In with Ethereum (EIP-4361) secara offline untuk wallet EOA.
import { getAddress, verifyMessage } from 'viem';
import { parseSiweMessage, validateSiweMessage } from 'viem/siwe';
import type { Address, Hex } from '@racing-gang/config/protocol';
import { unauthorized } from '../errors';
import type { NonceStore } from './nonceStore';

export async function verifySiwe(p: {
  message: string;
  signature: Hex;
  domain: string;
  chainId: number;
  nonces: NonceStore;
  now: number;
}): Promise<Address> {
  const parsed = parseSiweMessage(p.message);
  if (!parsed.address || !parsed.nonce) throw unauthorized('Pesan SIWE tidak lengkap');

  // Nonce dihapus di sini apa pun hasilnya, jadi tidak bisa dipakai ulang.
  const issued = p.nonces.take(parsed.nonce);
  if (!issued) throw unauthorized('Nonce tidak dikenal atau kedaluwarsa');
  const address = getAddress(parsed.address);
  if (address !== issued.address) throw unauthorized('Alamat tidak cocok dengan nonce');
  if (parsed.chainId !== p.chainId) throw unauthorized(`Chain ID harus ${p.chainId}`);

  const valid = validateSiweMessage({ message: parsed, domain: p.domain, nonce: parsed.nonce, time: new Date(p.now) });
  if (!valid) throw unauthorized('Domain atau masa berlaku pesan SIWE tidak valid');

  const ok = await verifyMessage({ address, message: p.message, signature: p.signature }).catch(() => false);
  if (!ok) throw unauthorized('Tanda tangan tidak valid');
  return address;
}
