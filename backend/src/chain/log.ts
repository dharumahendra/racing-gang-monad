/** Logger minimal untuk relayer dan indexer; cocok dengan signature logger pino/Fastify. */
export type ChainLog = {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
};

/** Satu baris JSON per log dengan level angka pino, supaya menyatu dengan log server. */
const line = (level: number, obj: object, msg: string) =>
  JSON.stringify({ level, time: Date.now(), ...obj, msg: `[chain] ${msg}` }, (_, v) => (typeof v === 'bigint' ? v.toString() : v));

export const consoleLog: ChainLog = {
  info: (obj, msg) => console.log(line(30, obj, msg)),
  warn: (obj, msg) => console.warn(line(40, obj, msg)),
  error: (obj, msg) => console.error(line(50, obj, msg)),
};

export const silentLog: ChainLog = { info: () => {}, warn: () => {}, error: () => {} };
