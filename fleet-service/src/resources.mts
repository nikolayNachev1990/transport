// Shared singletons, created exactly once (ESM module evaluation is
// cached — every importer gets the same instances). No S3/storage here,
// unlike company-service — fleet never touches file storage directly
// (spec section 7, "Файлове никога не минават през fleet"), only the
// files metadata mirror synced from upload-service's events.
import { createDb, assertNoPendingMigrations } from "@transport/core/db";
import { createBroker } from "@transport/core/broker";

import dbConfig from "./config/db.mjs";
import loadBrokerConfig from "./config/broker.mjs";

export const db = await createDb(dbConfig);
// Schema check at startup, no auto-migration — a forgotten
// `npm run migrate` crashes the process here instead of booting against a
// stale schema.
await assertNoPendingMigrations(db);
export const broker = await createBroker(await loadBrokerConfig(), { db });
