import { CARS, CHAIN, CONFIG_VERSION, RUN_TICKS, getDeployment } from '@racing-gang/config';
import { auditRun, type AuditRecords, type AuditResult } from '@racing-gang/sim';
import type { RunLogResponse, RunSummaryResponse } from '@racing-gang/config/protocol';
import { createPublicClient, getAbiItem, http, type Abi, type AbiEvent, type Hex } from 'viem';

export function auditVerdict(result: AuditResult, records: AuditRecords) {
  if (!result.ok) return 'mismatch' as const;
  return records.seed && records.end?.finalInputHash ? 'match' as const : 'incomplete' as const;
}
export function validateAuditLog(log: RunLogResponse, id: string) {
  if (log.runId?.toLowerCase() !== id.toLowerCase() || !/^0x[\da-f]{64}$/i.test(log.seed) ||
      log.configVersion !== CONFIG_VERSION || !CARS[log.carTier] ||
      !Number.isSafeInteger(log.seedBlock) || log.seedBlock < 0 ||
      !Array.isArray(log.entries) || log.entries.length > 100_000 ||
      log.entries.some(e => !Number.isInteger(e.tick) || e.tick < 0 || e.tick > RUN_TICKS || !Number.isInteger(e.kind) || !Number.isSafeInteger(e.data)))
    throw new Error('Run log is invalid or uses an unsupported configuration.');
}
export async function loadPublicAudit(id: string, apiUrl: string, rpcUrl: string | undefined, signal: AbortSignal) {
  if (!/^0x[\da-f]{64}$/i.test(id)) throw new Error('Invalid run ID.');
  if (!apiUrl) throw new Error('The backend URL is not configured.');
  const get = async <T>(suffix: string): Promise<T> => {
    const r = await fetch(apiUrl + '/runs/' + id + suffix, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
    if (!r.ok) throw new Error('Public run data unavailable (' + r.status + ').');
    return r.json();
  };
  const [log, summary] = await Promise.all([get<RunLogResponse>('/log'), get<RunSummaryResponse>('')]);
  signal.throwIfAborted();
  validateAuditLog(log, id);
  if (summary.runId !== log.runId || summary.seed !== log.seed || summary.carTier !== log.carTier ||
      summary.configVersion !== log.configVersion || !Array.isArray(summary.nearMissList)) throw new Error('Summary and log refer to different runs.');
  if (summary.lifecycle !== 'ENDED') throw new Error('Wait until the run has ended before auditing.');
  const backend: AuditRecords = {
    nearMisses: summary.nearMissList,
    end: summary.endTick === null ? undefined : { endTick: summary.endTick, totalNearMisses: summary.nearMisses, finalInputHash: summary.finalHash ?? undefined },
  };
  const backendResult = auditRun(log, backend);
  const deployment = getDeployment();
  if (!deployment) throw new Error('Contract deployment is not configured.');
  const client = createPublicClient({ transport: http(rpcUrl, { timeout: 15000, retryCount: 0 }), chain: undefined });
  // HTTP transport must use the intended chain RPC even if the caller did not override it.
  if (await client.getChainId() !== deployment.chainId) throw new Error('RPC chain does not match the deployment.');
  const abi = deployment.abi.RunRegistry as Abi;
  const run = await client.readContract({ address: deployment.runRegistry, abi, functionName: 'getRun', args: [id] }) as {
    player: string; carTier: number; configVersion: number; ended: boolean; nearMisses: number; seed: Hex;
  };
  signal.throwIfAborted();
  const records: AuditRecords = { nearMisses: [] };
  const latest = await client.getBlockNumber();
  const from = BigInt(log.seedBlock);
  const cap = from + BigInt(CHAIN.maxRunBlockSpan) + 300n;
  const to = latest < cap ? latest : cap;
  // Bounded RPC ranges follow the existing audit CLI; never scan the entire chain.
  for (let start = from; start <= to; start += 100n) {
    signal.throwIfAborted();
    const end = start + 99n < to ? start + 99n : to;
    for (const name of ['RunStarted', 'NearMiss', 'RunEnded']) {
      const event = getAbiItem({ abi, name }) as AbiEvent;
      const events = await client.getLogs({ address: deployment.runRegistry, event, args: { runId: id }, fromBlock: start, toBlock: end, strict: true });
      for (const eventLog of events) {
        const a = eventLog.args as Record<string, unknown>;
        if (name === 'RunStarted') records.seed = a.seed as Hex;
        if (name === 'NearMiss') records.nearMisses.push({ index: Number(a.index), tick: Number(a.tick), vehicleType: Number(a.vehicleType), inputHash: a.inputHash as Hex });
        if (name === 'RunEnded') records.end = { endTick: Number(a.endTick), totalNearMisses: Number(a.totalNearMisses), finalInputHash: a.finalInputHash as Hex };
      }
    }
  }
  signal.throwIfAborted();
  const chainResult = auditRun(log, records);
  const exists = run.player.toLowerCase() !== '0x0000000000000000000000000000000000000000';
  if (exists && (run.player.toLowerCase() !== log.player.toLowerCase() || run.seed.toLowerCase() !== log.seed.toLowerCase() ||
      run.carTier !== log.carTier || run.configVersion !== log.configVersion || (records.end && Number(run.nearMisses) !== records.end.totalNearMisses))) {
    chainResult.ok = false; chainResult.problems.push('Contract run identity or count differs from the public log.');
  }
  const complete = exists && run.ended && !!records.seed && !!records.end?.finalInputHash;
  return { backendResult, chainResult, verdict: complete ? auditVerdict(chainResult, records) : 'incomplete' as const,
    recorded: records.nearMisses.length, player: log.player, registry: deployment.runRegistry, explorer: deployment.explorerUrl };
}
