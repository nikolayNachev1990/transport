// One-off step, not run automatically on every boot (see resources.mts) —
// invoke explicitly via `npm run migrate`. Uses its own db connection
// instead of importing resources.mjs, so this doesn't also have to
// connect to Redis/Kafka just to touch Postgres.
import { createDb, runSeeds } from "@transport/core/db";
import dbConfig, { seedsDir } from "./config/db.mjs";

const db = await createDb(dbConfig);

console.log("Running migrations...");
await db.client().migrate.latest();

console.log("Running seeds...");
await runSeeds(db, [seedsDir]);

await db.stop();
console.log("Done.");
