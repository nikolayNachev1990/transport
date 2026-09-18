import { v7 as uuidv7 } from "uuid";
import type { BrokerEvent } from "@transport/core/broker";

interface CompanyCreated extends BrokerEvent {
  body: {
    id: string;
    is_active: boolean;
    subscription_plan: string | null;
    country: string | null;
  };
}

// Dynamic import, not a top-level one — this file is imported by
// config/broker.mts's consumer scan, which resources.mjs's own broker
// creation runs during its top-level await; a top-level import of
// resources.mjs here would deadlock (see every other service's own
// lazily-imported event handlers for the full explanation).
//
// Fleet only ever needs the plan code here (never subscription status/
// dates/payment info — company-service's own concern, spec section 1) —
// the real event body carries far more than this (company.created's own
// field is still called subscription_plan; fleet's local column is
// named plan_code, matching the spec's own naming for this table), the
// rest is simply not selected out of the body.
export default async (event: CompanyCreated) => {
  const { id, is_active, subscription_plan, country } = event.body;

  const { db } = await import("../../resources.mjs");
  await db.raw(
    `INSERT INTO companies (id, is_active, plan_code, country, source_event_id, synced_at)
     VALUES (:id, :isActive, :planCode, :country, :sourceEventId, now())
     ON CONFLICT (id) DO UPDATE SET
       is_active = EXCLUDED.is_active,
       plan_code = EXCLUDED.plan_code,
       country = EXCLUDED.country,
       source_event_id = EXCLUDED.source_event_id,
       synced_at = now()`,
    { id, isActive: is_active, planCode: subscription_plan, country, sourceEventId: uuidv7() },
  );
};
