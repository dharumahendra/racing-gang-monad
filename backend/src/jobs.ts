// Job berkala server.
import type { AppContext } from './app';
import { releaseExpiredReservations } from './services/vouchers';

type Log = { error: (obj: unknown, msg?: string) => void };

/** Jalankan job berkala; kembalikan fungsi untuk menghentikannya. Error satu job dicatat, tidak mematikan proses. */
export function startJobs(ctx: AppContext, log: Log): () => void {
  const every = (name: string, ms: number, fn: () => void) =>
    setInterval(() => {
      try {
        fn();
      } catch (err) {
        log.error({ err, job: name }, 'job berkala gagal');
      }
    }, ms);
  const timers = [
    every('checkTimeouts', 1000, () => ctx.runs.checkTimeouts()),
    every('tickEnergy', 1000, () => ctx.rooms.tickEnergy()),
    every('releaseExpiredReservations', 30_000, () => void releaseExpiredReservations(ctx.db, ctx.now())),
  ];
  return () => timers.forEach(clearInterval);
}
