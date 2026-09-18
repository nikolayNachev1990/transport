import { v7 as uuidv7 } from "uuid";
import type { BrokerEvent } from "@transport/core/broker";

interface PlanUpserted extends BrokerEvent {
  body: {
    code: string;
    max_units: number | null;
  };
}

export default async (event: PlanUpserted) => {
  const { code, max_units } = event.body;

  const { db } = await import("../../resources.mjs");
  await db.raw(
    `INSERT INTO plans (code, max_units, source_event_id, synced_at)
     VALUES (:code, :maxUnits, :sourceEventId, now())
     ON CONFLICT (code) DO UPDATE SET
       max_units = EXCLUDED.max_units,
       source_event_id = EXCLUDED.source_event_id,
       synced_at = now()`,
    { code, maxUnits: max_units, sourceEventId: uuidv7() },
  );
};
