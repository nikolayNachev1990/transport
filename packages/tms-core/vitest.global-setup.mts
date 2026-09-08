import { runMigrationCommand } from "./src/db/cli.mts";
import { testDatabaseUrl, MIGRATIONS_DIR } from "./src/db/__fixtures__/test-db.mts";

// Runs once before/after the whole file's test run, not per test file — the
// alternative (db.test.mts and internal-routes.test.mts each running their
// own migrate:latest/rollback against the same physical database, possibly
// in parallel vitest workers) is exactly the race that bit cli.test.mts vs
// db.test.mts earlier: two files independently creating/dropping the same
// tables. cli.test.mts is unaffected — it uses its own migrations
// directory, tables, and bookkeeping table name.
export async function setup(): Promise<void> {
  if (process.env["TEST_DATABASE_URL"] === undefined) {
    return;
  }
  await runMigrationCommand("migrate:latest", { connectionString: testDatabaseUrl(), migrationsDir: MIGRATIONS_DIR });
}

export async function teardown(): Promise<void> {
  if (process.env["TEST_DATABASE_URL"] === undefined) {
    return;
  }
  await runMigrationCommand("migrate:rollback", { connectionString: testDatabaseUrl(), migrationsDir: MIGRATIONS_DIR });
}
