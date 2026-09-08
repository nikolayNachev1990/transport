import { runMigrationCommand } from "./src/db/cli.mts";
import { testDatabaseUrl, MIGRATIONS_DIR as DB_MIGRATIONS_DIR } from "./src/db/__fixtures__/test-db.mts";
import { MIGRATIONS_DIR as EVENTS_MIGRATIONS_DIR } from "./src/events/__fixtures__/test-env.mts";

// Runs once before/after the whole file's test run, not per test file — the
// alternative (db.test.mts and internal-routes.test.mts each running their
// own migrate:latest/rollback against the same physical database, possibly
// in parallel vitest workers) is exactly the race that bit cli.test.mts vs
// db.test.mts earlier: two files independently creating/dropping the same
// tables. cli.test.mts is unaffected — it uses its own migrations
// directory, tables, and bookkeeping table name.
//
// db's and events' migrations get their own bookkeeping table each
// (migrationsTableName) — sharing the default knex_migrations table looked
// harmless at first (disjoint filenames) but isn't: knex's migrate.latest/
// rollback validates the *entire* migrations table against whatever
// migrationSource is configured for *this* call, and errors out the moment
// it finds a historical row whose file isn't in the current directory. Two
// unrelated migration sets simply can't share one bookkeeping table.
const EVENTS_MIGRATIONS_TABLE = "test_events_knex_migrations";

export async function setup(): Promise<void> {
  if (process.env["TEST_DATABASE_URL"] === undefined) {
    return;
  }
  const connectionString = testDatabaseUrl();
  await runMigrationCommand("migrate:latest", { connectionString, migrationsDir: DB_MIGRATIONS_DIR });
  await runMigrationCommand("migrate:latest", {
    connectionString,
    migrationsDir: EVENTS_MIGRATIONS_DIR,
    migrationsTableName: EVENTS_MIGRATIONS_TABLE,
  });
}

export async function teardown(): Promise<void> {
  if (process.env["TEST_DATABASE_URL"] === undefined) {
    return;
  }
  const connectionString = testDatabaseUrl();
  await runMigrationCommand("migrate:rollback", {
    connectionString,
    migrationsDir: EVENTS_MIGRATIONS_DIR,
    migrationsTableName: EVENTS_MIGRATIONS_TABLE,
  });
  await runMigrationCommand("migrate:rollback", { connectionString, migrationsDir: DB_MIGRATIONS_DIR });
}
