// Shared singletons, created exactly once (ESM module evaluation is
// cached — every importer gets the same instances).
import { createDb, assertNoPendingMigrations } from "@transport/core/db";
import { createStorage } from "@transport/core/s3";
import { createBroker } from "@transport/core/broker";

import dbConfig from "./config/db.mjs";
import s3Config from "./config/s3.mjs";
import loadBrokerConfig from "./config/broker.mjs";

export const db = await createDb(dbConfig);
// Schema check at startup, no auto-migration — a forgotten
// `npm run migrate` crashes the process here instead of booting against a
// stale schema.
await assertNoPendingMigrations(db);
export const storage = createStorage(s3Config);
export const broker = await createBroker(await loadBrokerConfig(), { db });
