import { afterEach, describe, expect, it } from "vitest";
import knexInit from "knex";
import { runMigrationCommand } from "./cli.mjs";
import { testDatabaseUrl, CLI_MIGRATIONS_DIR } from "./__fixtures__/test-db.mjs";

const MARKER_TABLE = "test_cli_marker";
const MARKER_MIGRATION_FILE = "20260101000000_create_test_cli_marker.mjs";
// A dedicated bookkeeping table so this file's migrations never collide with
// db.test.mts's, which runs a different migration set against the same
// physical test database, possibly in a parallel vitest worker.
const MIGRATIONS_TABLE_NAME = "test_cli_knex_migrations";

function baseOptions() {
  return {
    connectionString: testDatabaseUrl(),
    migrationsDir: CLI_MIGRATIONS_DIR,
    migrationsTableName: MIGRATIONS_TABLE_NAME,
  };
}

afterEach(async () => {
  const knexInstance = knexInit({ client: "pg", connection: testDatabaseUrl() });
  await knexInstance.schema.dropTableIfExists(MARKER_TABLE);
  await knexInstance(MIGRATIONS_TABLE_NAME).where({ name: MARKER_MIGRATION_FILE }).delete();
  await knexInstance.destroy();
});

describe("runMigrationCommand (requirement 6 — separate command, real rollback)", () => {
  it("migrate:latest creates the table for real", async () => {
    const applied = await runMigrationCommand("migrate:latest", baseOptions());
    expect(applied).toContain(MARKER_MIGRATION_FILE);

    const inspectKnex = knexInit({ client: "pg", connection: testDatabaseUrl() });
    expect(await inspectKnex.schema.hasTable(MARKER_TABLE)).toBe(true);
    await inspectKnex.destroy();
  });

  it("migrate:rollback really removes what migrate:latest created", async () => {
    await runMigrationCommand("migrate:latest", baseOptions());
    const rolledBack = await runMigrationCommand("migrate:rollback", baseOptions());
    expect(rolledBack).toContain(MARKER_MIGRATION_FILE);

    const inspectKnex = knexInit({ client: "pg", connection: testDatabaseUrl() });
    expect(await inspectKnex.schema.hasTable(MARKER_TABLE)).toBe(false);
    await inspectKnex.destroy();
  });

  it("migrate:latest run twice is a no-op the second time (idempotent)", async () => {
    await runMigrationCommand("migrate:latest", baseOptions());
    const secondRun = await runMigrationCommand("migrate:latest", baseOptions());
    expect(secondRun).toEqual([]);
  });
});
