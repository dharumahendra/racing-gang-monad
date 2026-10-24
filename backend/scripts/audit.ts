// Audit satu run dari luar (PRD §9.1): ambil log publik, replay dengan packages/sim, lalu cocokkan.
//   pnpm --filter @racing-gang/backend audit -- --url https://api.contoh.com --run 0x...
//   ... --rpc https://testnet-rpc.monad.xyz --registry 0x...   cocokkan dengan event on-chain (bukan catatan backend)
// Tanpa --rpc, yang dicocokkan adalah catatan backend (GET /runs/:id). Dengan --rpc, sumbernya event RunRegistry.
import { parseArgs } from 'node:util';
import { createPublicClient, http, parseAbi, type Address, type Hex } from 'viem';
import { CHAIN } from '@racing-gang/config';
import type { RunLogResponse, RunSummaryResponse } from '@racing-gang/config/protocol';
import { auditRun, type AuditRecords } from '@racing-gang/sim';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:8080' },
    run: { type: 'string' },
    rpc: { type: 'string' },
    registry: { type: 'string' },
    chunk: { type: 'string', default: '100' },
  },
});
if (!args.run || !/^0x[0-9a-fA-F]{64}$/.test(args.run)) {
  console.error('Wajib --run <runId bytes32>');
  process.exit(1);
}
const runId = args.run as Hex;

// TECH_SPEC §6.1
const events = parseAbi([
  'event RunStarted(bytes32 indexed runId, address indexed player, uint8 carTier, bytes32 seed, uint64 seedBlock, uint16 configVersion)',
  'event NearMiss(bytes32 indexed runId, address indexed player, uint16 index, uint16 tick, uint8 vehicleType, uint32 vehicleId, bytes32 inputHash)',
  'event RunEnded(bytes32 indexed runId, uint8 reason, uint16 endTick, uint16 totalNearMisses, bytes32 finalInputHash)',
]);

async function fromChain(log: RunLogResponse): Promise<AuditRecords> {
  const client = createPublicClient({ transport: http(args.rpc) });
  const address = args.registry as Address;
  const latest = await client.getBlockNumber();
  const from = BigInt(log.seedBlock);
  // Semua catatan run harus masuk dalam maxRunBlockSpan blok setelah dimulai.
  const to = [latest, from + BigInt(CHAIN.maxRunBlockSpan) + 300n].reduce((a, b) => (a < b ? a : b));
  const step = BigInt(args.chunk!);
  const rec: AuditRecords = { nearMisses: [] };
  const [started, nearMiss, ended] = events;
  // RPC publik membatasi rentang getLogs, jadi diambil per potongan blok, satu jenis event per panggilan.
  for (let start = from; start <= to; start += step) {
    const end = start + step - 1n < to ? start + step - 1n : to;
    const range = { address, args: { runId }, fromBlock: start, toBlock: end } as const;
    for (const l of await client.getLogs({ ...range, event: started })) rec.seed = l.args.seed!;
    for (const l of await client.getLogs({ ...range, event: nearMiss })) {
      rec.nearMisses.push({ index: l.args.index!, tick: l.args.tick!, vehicleType: l.args.vehicleType!, inputHash: l.args.inputHash! });
    }
    for (const l of await client.getLogs({ ...range, event: ended })) {
      rec.end = { endTick: l.args.endTick!, totalNearMisses: l.args.totalNearMisses!, finalInputHash: l.args.finalInputHash! };
    }
  }
  return rec;
}

function fromBackend(s: RunSummaryResponse): AuditRecords {
  return {
    nearMisses: s.nearMissList.map((n) => ({ index: n.index, tick: n.tick, vehicleType: n.vehicleType, inputHash: n.inputHash })),
    end: s.endTick === null ? undefined : { endTick: s.endTick, totalNearMisses: s.nearMisses, finalInputHash: s.finalHash ?? undefined },
  };
}

const get = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${args.url}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
};

const log = await get<RunLogResponse>(`/runs/${runId}/log`);
const source = args.rpc && args.registry ? 'event on-chain RunRegistry' : 'catatan backend';
const rec = args.rpc && args.registry ? await fromChain(log) : fromBackend(await get<RunSummaryResponse>(`/runs/${runId}`));
const result = auditRun({ runId: log.runId, seed: log.seed, carTier: log.carTier, entries: log.entries }, rec);

console.log(`Audit run ${runId}`);
console.log(`  pemain ${log.player} · mobil tier ${log.carTier} · ${log.entries.length} entri log · dibandingkan dengan ${source}`);
if (result.seedOk !== null) console.log(`  ${result.seedOk ? '✓' : '✗'} seed ${log.seed}`);
for (const r of result.rows) {
  const v = r.replayed ?? r.recorded!;
  console.log(`  ${r.ok ? '✓' : '✗'} mepet #${r.index} · tick ${v.tick} · ${v.vehicleType === 1 ? 'truk' : 'mobil'}${r.problem ? ` · ${r.problem}` : ''}`);
}
if (result.endOk !== null) console.log(`  ${result.endOk ? '✓' : '✗'} akhir run · tick ${result.replayEndTick} · hash ${result.replayFinalHash.slice(0, 18)}…`);
console.log(result.ok ? '\nCOCOK: semua mepet bisa dihitung ulang dari log publik.' : `\nTIDAK COCOK: ${result.problems.join('; ')}`);
process.exitCode = result.ok ? 0 : 1;
