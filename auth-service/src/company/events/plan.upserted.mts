import type { BrokerEvent } from "@transport/core/broker";

interface PlanUpserted extends BrokerEvent {
  body: {
    code: string;
    max_owners: number | null;
    max_staff: number | null;
    max_units: number | null;
    max_drivers: number | null;
    updated_at: string;
  };
}

export default async (event: PlanUpserted) => {
  const { code, max_owners, max_staff, max_units, max_drivers, updated_at } = event.body;

  const { db } = await import("../../resources.mjs");
  await db.raw(
    `INSERT INTO plans (code, max_owners, max_staff, max_units, max_drivers, updated_at)
     VALUES (:code, :max_owners, :max_staff, :max_units, :max_drivers, :updated_at)
     ON CONFLICT (code) DO UPDATE SET
       max_owners = EXCLUDED.max_owners,
       max_staff = EXCLUDED.max_staff,
       max_units = EXCLUDED.max_units,
       max_drivers = EXCLUDED.max_drivers,
       updated_at = EXCLUDED.updated_at`,
    { code, max_owners, max_staff, max_units, max_drivers, updated_at },
  );
};
