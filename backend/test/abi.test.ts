import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toEventSelector, toFunctionSelector, type Abi, type AbiEvent, type AbiFunction } from 'viem';
import { carNftAbi, runRegistryAbi } from '../src/chain/abi';

// Artifact Foundry hanya ada setelah `forge build` di contract/; di CI workspace test ini dilewati.
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../contract/out');
const artifact = (name: string): Abi | undefined => {
  const path = resolve(outDir, `${name}.sol/${name}.json`);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')).abi as Abi) : undefined;
};

/** Fungsi dan event dibandingkan lewat selector (ikut tipe parameter), error lewat nama dan jumlah parameter. */
const signatures = (abi: Abi) =>
  new Set(
    abi.flatMap((item) => {
      if (item.type === 'function') return [`function ${toFunctionSelector(item as AbiFunction)} ${item.name}`];
      if (item.type === 'event') return [`event ${toEventSelector(item as AbiEvent)} ${item.name}`];
      if (item.type === 'error') return [`error ${item.name}/${item.inputs.length}`];
      return [];
    }),
  );

describe.each([
  ['RunRegistry', runRegistryAbi],
  ['CarNFT', carNftAbi],
] as const)('ABI %s cocok dengan artifact Foundry', (name, abi) => {
  const full = artifact(name);
  it.skipIf(!full)('setiap fungsi, event, dan error ada di kontrak', () => {
    const contract = signatures(full!);
    for (const s of signatures(abi as Abi)) expect(contract.has(s), s).toBe(true);
  });
});
