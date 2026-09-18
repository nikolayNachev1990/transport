// Every fleet.*.upserted/.changed event's body keys already match its
// target query_db table's column names 1:1 (the migrations were derived
// directly from these same event schemas — see query-service/src/
// migrations/2026093*) so one generic INSERT ... ON CONFLICT DO UPDATE
// covers all of them instead of hand-writing ~15 near-identical upserts.
import type { Db } from "@transport/core/db";

export async function upsertRow(
  db: Db,
  table: string,
  pkCols: string[],
  body: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const sets = { ...body, ...extra };
  const columns = Object.keys(sets);
  const insertCols = columns.join(", ");
  const insertVals = columns.map((c) => `:${c}`).join(", ");
  const updateSets = columns.filter((c) => !pkCols.includes(c)).map((c) => `${c} = EXCLUDED.${c}`);
  const conflictCols = pkCols.join(", ");

  const sql =
    updateSets.length > 0
      ? `INSERT INTO ${table} (${insertCols}) VALUES (${insertVals}) ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateSets.join(", ")}`
      : `INSERT INTO ${table} (${insertCols}) VALUES (${insertVals}) ON CONFLICT (${conflictCols}) DO NOTHING`;

  await db.raw(sql, sets);
}
