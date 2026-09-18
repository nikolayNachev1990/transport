import path from "node:path";
import { loadConfig } from "@transport/core/config";
import type { DbConfig } from "@transport/core/db";

const env = loadConfig(
  {
    DATABASE_URL: { required: true, description: "Postgres connection string" },
  },
  process.env,
);

export const migrationsDir = path.resolve(process.cwd(), "src/migrations");

export default {
  client: "pg",
  connection: env.DATABASE_URL,
  migrations: { directory: migrationsDir },
} satisfies DbConfig;
