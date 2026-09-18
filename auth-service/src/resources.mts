// Shared singletons, created exactly once (ESM module evaluation is
// cached — every importer gets the same instances). Simpler than
// threading req.app.locals through module-level code that has no request
// (passport strategies registered once at startup, the OAuth2Server model,
// event consumers) — those don't have a `req` to read locals off of.
// core's own middleware (restIdempotence) still reads req.app.locals,
// since core doesn't know this file exists — index.mts mirrors these onto
// app.locals too, for that middleware's benefit.
import { createDb, assertNoPendingMigrations } from "@transport/core/db";
import { createCache } from "@transport/core/cache";
import { createIdempotence } from "@transport/core/idempotence";
import { createStorage } from "@transport/core/s3";
import { createSearch } from "@transport/core/search";
import { createBroker } from "@transport/core/broker";

import dbConfig from "./config/db.mjs";
import cacheConfig from "./config/cache.mjs";
import idempotenceConfig from "./config/idempotence.mjs";
import s3Config from "./config/s3.mjs";
import searchConfig from "./config/search.mjs";
import loadBrokerConfig from "./config/broker.mjs";

export const db = await createDb(dbConfig);
// Schema check at startup, no auto-migration — a forgotten
// `npm run migrate` crashes the process here instead of booting against a
// stale schema.
await assertNoPendingMigrations(db);
export const cache = await createCache(cacheConfig);
export const idempotence = await createIdempotence(idempotenceConfig);
export const storage = createStorage(s3Config);
export const search = searchConfig.status ? await createSearch(searchConfig) : null;
export const broker = await createBroker(await loadBrokerConfig(), { db });
