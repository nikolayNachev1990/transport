import type { Db } from "@transport/core/db";
import type { Cache } from "@transport/core/cache";
import type { Storage } from "@transport/core/s3";
import type { Search } from "@transport/core/search";
import type { Broker } from "@transport/core/broker";

// What this app puts on app.locals at bootstrap (see src/index.mts) — every
// rest handler and event consumer reads shared resources from here instead
// of constructing its own (the old `new Db()` pattern only worked because
// the old Db was secretly a static singleton).
declare global {
  namespace Express {
    interface Locals {
      db: Db;
      cache: Cache;
      storage: Storage;
      search: Search | null;
      broker: Broker;
    }
  }
}

export {};
