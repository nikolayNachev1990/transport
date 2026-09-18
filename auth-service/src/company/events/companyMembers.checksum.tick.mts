import type { BrokerEvent } from "@transport/core/broker";
import { Gauge } from "prom-client";

// Module-level, not inside the handler — prom-client throws if the same
// metric name is registered twice, and this file is only ever imported
// once (config/broker.mts's consumer scan). Exposed automatically on
// GET /metrics (see @transport/core/server), no extra wiring needed.
const mismatchGauge = new Gauge({
  name: "company_members_counter_checksum_mismatches",
  help: "Rows in company_members whose users_created_count disagrees with a real count(*) over users.created_by (spec rule 13). 0 after a clean nightly run.",
});

interface ChecksumRow {
  user_id: string;
  company_id: string;
  users_created_count: number;
  real_count: string; // count(*) comes back as text from pg
}

// Dynamic import, not a top-level one — same deadlock reasoning as every
// other lazily-imported event handler in this service.
export default async (_event: BrokerEvent) => {
  const { db } = await import("../../resources.mjs");

  const result = await db.raw<{ rows: ChecksumRow[] }>(`
    SELECT
      cm.user_id,
      cm.company_id,
      cm.users_created_count,
      (
        SELECT count(*) FROM users u
        WHERE u.created_by = cm.user_id AND u.company_id = cm.company_id AND u.deleted_at IS NULL
      ) AS real_count
    FROM company_members cm
  `);

  const mismatches = (result?.rows ?? []).filter((row) => Number(row.real_count) !== row.users_created_count);
  mismatchGauge.set(mismatches.length);

  if (mismatches.length > 0) {
    console.log(
      `company_members checksum: ${mismatches.length} mismatch(es)`,
      mismatches.map((row) => ({ user_id: row.user_id, company_id: row.company_id, expected: row.users_created_count, actual: Number(row.real_count) })),
    );
  }
};
