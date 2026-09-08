import type { Db } from "../db/db.mjs";

export interface CleanupOptions {
  olderThanMs: number;
}

// Without this the outbox table grows forever — every published row stays
// unless something deletes it. Meant to run periodically (BullMQ cron,
// stage 51's scheduler), not from the relay itself: cleanup and delivery
// are different concerns with different failure modes.
export async function cleanupPublishedOutboxRows(db: Db, options: CleanupOptions): Promise<number> {
  const result = await db.rawUnsafe<{ rowCount: number | null }>(
    `DELETE FROM outbox WHERE published_at IS NOT NULL AND published_at < now() - (? || ' milliseconds')::interval`,
    [options.olderThanMs],
  );
  return result.rowCount ?? 0;
}
