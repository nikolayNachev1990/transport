// One-off step, not run automatically on every boot — invoke explicitly
// via `npm run seed:plans`, after `npm run migrate`. Own db+broker
// connection (unlike migrate.mts, this needs the broker too, since
// seeding a plan also has to publish plan.upserted).
//
// Explicit numbers here, not a formula evaluated at query time — the
// max_drivers = floor(max_units * 1.2) rule is arithmetic done once,
// by hand, when this table was written; "free" is the stated exception
// (5, not floor(5*1.2)=6). max_units counts every vehicle kind fleet-
// service tracks (tractor units, rigid trucks, vans, cars) — not just
// trucks, despite the name this column had before fleet-service existed.
import { createDb } from "@transport/core/db";
import { createBroker } from "@transport/core/broker";
import dbConfig from "./config/db.mjs";
import loadBrokerConfig from "./config/broker.mjs";

interface PlanSeed {
  code: string;
  max_owners: number | null;
  max_staff: number | null;
  max_units: number | null;
  max_drivers: number | null;
}

const PLANS: PlanSeed[] = [
  { code: "free", max_owners: 1, max_staff: 5, max_units: 5, max_drivers: 5 },
  { code: "plan_1", max_owners: 3, max_staff: 5, max_units: 10, max_drivers: 12 },
  { code: "plan_2", max_owners: 5, max_staff: 10, max_units: 30, max_drivers: 36 },
  { code: "super_pro", max_owners: 5, max_staff: 20, max_units: 100, max_drivers: 120 },
  { code: "unlimited", max_owners: 10, max_staff: null, max_units: null, max_drivers: null },
];

const db = await createDb(dbConfig);
const broker = await createBroker(await loadBrokerConfig(), { db });

console.log(`Seeding ${PLANS.length} plan(s)...`);
for (const plan of PLANS) {
  const result = await db.raw<{ rows: (PlanSeed & { updated_at: Date })[] }>(
    `INSERT INTO plans (code, max_owners, max_staff, max_units, max_drivers, updated_at)
     VALUES (:code, :max_owners, :max_staff, :max_units, :max_drivers, now())
     ON CONFLICT (code) DO UPDATE SET
       max_owners = EXCLUDED.max_owners,
       max_staff = EXCLUDED.max_staff,
       max_units = EXCLUDED.max_units,
       max_drivers = EXCLUDED.max_drivers,
       updated_at = now()
     RETURNING *`,
    plan as unknown as Record<string, unknown>,
  );
  const row = result?.rows[0];
  if (!row) {
    console.log(`Seeding "${plan.code}" failed.`);
    continue;
  }

  await broker.send("plan.upserted", row);
  console.log(`Seeded "${plan.code}".`);
}

await broker.stop();
await db.stop();
console.log("Done.");
