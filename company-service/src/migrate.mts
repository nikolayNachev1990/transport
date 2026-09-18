// One-off step, not run automatically on every boot — invoke explicitly
// via `npm run migrate`. Own db connection, doesn't touch resources.mts
// (no need to connect to Kafka just to run migrations).
import { createDb } from "@transport/core/db";
import dbConfig from "./config/db.mjs";

const db = await createDb(dbConfig);

console.log("Running migrations...");
await db.client().migrate.latest();

await db.stop();
console.log("Done.");
