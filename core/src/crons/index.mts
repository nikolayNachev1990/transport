import type { Db } from "../db/index.mjs";

export interface CronJobRow {
  id: string | number;
  event_name: string;
  timeout: string;
  active: boolean;
}

export interface CronTracker {
  addEvent(eventName: string): Promise<CronJobRow | null>;
  completeEvent(id: string | number): Promise<boolean>;
}

const DATE_FORMAT_LENGTH = 14; // YYYYMMDDHHmmss

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:T.Z]/g, "").slice(0, DATE_FORMAT_LENGTH);
}

function parseTimestamp(value: string): Date {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6)) - 1;
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  return new Date(Date.UTC(year, month, day, hour, minute, second));
}

// Tracks in-flight cron runs in a db table so overlapping schedule ticks
// don't run the same job twice — a dedup/lock mechanism, not the scheduler
// itself (node-cron or similar still decides *when* to tick).
export function createCronTracker(db: Db, timeoutMinutes: number): CronTracker {
  return {
    async addEvent(eventName) {
      const now = new Date();
      const newTimeout = formatTimestamp(new Date(now.getTime() + timeoutMinutes * 60_000));

      const running = await db.findByWhere<CronJobRow>("cron_jobs", { event_name: eventName, active: true });
      const runningRow = Array.isArray(running) ? running[0] : running;

      if (runningRow) {
        const cronTimeout = parseTimestamp(runningRow.timeout);
        if (cronTimeout.getTime() < now.getTime()) {
          return db.updateById<CronJobRow>("cron_jobs", runningRow.id, { timeout: newTimeout });
        }
        return null; // active run found, timeout not passed yet
      }

      return db.insert<CronJobRow>("cron_jobs", { event_name: eventName, timeout: newTimeout, active: true });
    },

    async completeEvent(id) {
      const row = await db.findById<CronJobRow>("cron_jobs", id);
      if (!row) return false;
      await db.deleteById("cron_jobs", row.id);
      return true;
    },
  };
}
