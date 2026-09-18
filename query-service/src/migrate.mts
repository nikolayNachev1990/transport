// One-off step, not run automatically on every boot — invoke explicitly
// via `npm run migrate`. Own db connection, doesn't touch resources.mts
// (no need to connect to Kafka just to run migrations).
import { createDb, runSeeds } from "@transport/core/db";
import dbConfig, { seedsDir } from "./config/db.mjs";

const db = await createDb(dbConfig);

console.log("Running migrations...");
await db.client().migrate.latest();

console.log("Running seeds...");
await runSeeds(db, [seedsDir]);

await db.stop();
console.log("Done.");
