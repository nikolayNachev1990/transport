import { defineTable, type TenantScopedRow } from "../db/table.mjs";

export interface OutboxRow extends TenantScopedRow {
  aggregate_id: string;
  event_type: string;
  version: number;
  payload: unknown;
  published_at: Date | null;
}

// Every writing service owns its own outbox table, in its own database —
// this defines the shape, not a shared physical table.
export const outboxTable = defineTable<OutboxRow>("outbox", { tenantScoped: true });
