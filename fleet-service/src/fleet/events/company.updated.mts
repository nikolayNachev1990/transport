import { v7 as uuidv7 } from "uuid";
import type { BrokerEvent } from "@transport/core/broker";

interface CompanyUpdated extends BrokerEvent {
  body: Record<string, unknown> & { id: string };
}

// Only the columns fleet's local mirror actually has — company.updated
// carries "id" plus whatever changed on company-service's side, most of
// which fleet has no column for (name, eik, address, ...). A blind
// field-for-field update would fail the moment an unrelated field
// changed.
const MIRRORED_FIELDS: Record<string, string> = {
  is_active: "is_active",
  subscription_plan: "plan_code",
  country: "country",
};

export default async (event: CompanyUpdated) => {
  const { id, ...rest } = event.body;
  const sets: Record<string, unknown> = {};
  for (const [eventField, column] of Object.entries(MIRRORED_FIELDS)) {
    if (Object.prototype.hasOwnProperty.call(rest, eventField)) sets[column] = rest[eventField];
  }
  if (Object.keys(sets).length === 0) return;

  const { db } = await import("../../resources.mjs");
  await db.updateById("companies", id, { ...sets, source_event_id: uuidv7(), synced_at: new Date() });
};
