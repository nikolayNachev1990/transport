import type { BrokerEvent } from "@transport/core/broker";

interface CompanyUpdated extends BrokerEvent {
  body: Record<string, unknown> & { id: string };
}

// Only the columns auth's own local mirror actually has — company.updated
// carries "id" plus whatever business/billing fields changed on
// company-service's side (name, eik, address, ...), most of which this
// service has no column for. A blind field-for-field update (the way
// query-service's generic sync map handles this same topic) would fail
// with "column does not exist" the moment an unrelated field changed.
const MIRRORED_FIELDS = ["subscription_plan", "subscription_valid_until", "is_active"] as const;

export default async (event: CompanyUpdated) => {
  const { id, ...rest } = event.body;
  const sets: Record<string, unknown> = {};
  for (const field of MIRRORED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rest, field)) sets[field] = rest[field];
  }
  if (Object.keys(sets).length === 0) return;

  const { db } = await import("../../resources.mjs");
  await db.updateById("companies", id, sets);
};
