import path from "node:path";
import { loadConfig } from "@transport/core/config";
import type { DbConfig } from "@transport/core/db";

const env = loadConfig(
  {
    DATABASE_URL: { required: true, description: "Postgres connection string" },
  },
  process.env,
);

// Stand-in for the real Kafka sync (still not wired — see
// src/config/broker.mts) until that exists: seeds the 3 fixed bootstrap
// accounts auth-service also seeds, so query-db's users table isn't
// empty in the meantime.
export const migrationsDir = path.resolve(process.cwd(), "src/migrations");
export const seedsDir = path.resolve(process.cwd(), "src/seeds");

export default {
  client: "pg",
  connection: env.DATABASE_URL,
  migrations: { directory: migrationsDir },
} satisfies DbConfig;
