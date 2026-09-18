// Shared singletons, created exactly once (ESM module evaluation is
// cached — every importer gets the same instances). Only db + broker for
// now — this service doesn't need cache/idempotence/s3/search until it
// grows past "connect to its own DB and to Kafka" (see auth-service's
// resources.mts for the fuller version once this service needs more).
import { createDb } from "@transport/core/db";
import { createBroker } from "@transport/core/broker";

import dbConfig from "./config/db.mjs";
import loadBrokerConfig from "./config/broker.mjs";

export const db = await createDb(dbConfig);
export const broker = await createBroker(await loadBrokerConfig(), { db });
