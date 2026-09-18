// SPEC-fleet-service.md §8 — the "units" limit and the inactive-company
// gate, shared by vehicles (trailers don't count against either).
import type { Knex } from "knex";

const COUNTED_STATUSES = ["active", "in_workshop", "out_of_service"];

export function isCountedStatus(status: string): boolean {
  return COUNTED_STATUSES.includes(status);
}

// Caller must already be inside the transaction that will perform the
// create/restore/status-change — the FOR UPDATE lock only serializes
// concurrent callers against each other for the duration of that same
// transaction, not across separate connections.
export async function isUnderUnitLimit(trx: Knex.Transaction, companyId: string): Promise<boolean> {
  const companyResult = await trx.raw(`SELECT plan_code FROM companies WHERE id = :companyId FOR UPDATE`, { companyId });
  const company = companyResult.rows[0] as { plan_code: string } | undefined;
  if (!company) return false;

  const planResult = await trx.raw(`SELECT max_units FROM plans WHERE code = :code`, { code: company.plan_code });
  const plan = planResult.rows[0] as { max_units: number | null } | undefined;
  if (!plan || plan.max_units == null) return true; // unknown plan row or NULL = unlimited

  const countResult = await trx.raw(
    `SELECT count(*) AS count FROM vehicles WHERE company_id = :companyId AND status NOT IN ('sold','scrapped') AND deleted_at IS NULL`,
    { companyId },
  );
  return Number(countResult.rows[0].count) < plan.max_units;
}

export async function isCompanyActive(trx: Knex.Transaction, companyId: string): Promise<boolean> {
  const result = await trx.raw(`SELECT is_active, deleted_at FROM companies WHERE id = :companyId`, { companyId });
  const row = result.rows[0] as { is_active: boolean; deleted_at: Date | null } | undefined;
  return !!row && row.is_active && row.deleted_at === null;
}
