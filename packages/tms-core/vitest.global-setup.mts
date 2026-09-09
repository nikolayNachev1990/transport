import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrationCommand } from "./src/db/cli.mts";
import { testDatabaseUrl, MIGRATIONS_DIR as DB_MIGRATIONS_DIR } from "./src/db/__fixtures__/test-db.mts";
import { MIGRATIONS_DIR as EVENTS_MIGRATIONS_DIR } from "./src/events/__fixtures__/test-env.mts";

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(PACKAGE_DIR, "..", "..");

// A Node-version drift once made a native binding (@confluentinc/kafka-javascript,
// built against a different NODE_MODULE_VERSION) fail to load — that specific
// failure was at least loud (a thrown error), but the underlying drift is the
// real risk: it silently hid two whole test suites' worth of coverage behind
// what still looked, at a glance, like a normal run. Checked against the
// repo's own .nvmrc rather than a hardcoded number, so this never goes stale.
function assertNodeVersionMatchesNvmrc(): void {
  const expected = readFileSync(join(REPO_ROOT, ".nvmrc"), "utf8").trim();
  const actualMajor = process.versions.node.split(".")[0];
  if (actualMajor !== expected) {
    throw new Error(
      `This shell is running Node ${process.versions.node}, but .nvmrc pins Node ${expected}.x. ` +
        `A native binding built for the wrong Node ABI can fail to load without necessarily failing ` +
        `the whole test run loudly — run "nvm use" (or equivalent) before testing.`,
    );
  }
}

// Independent of vitest's own file collection — a broken include/exclude
// pattern, a misnamed file, or anything else that quietly drops test files
// from a run wouldn't show up as a failure, just as fewer tests. This floor
// is comfortably below the current file count (28) so it only trips on a
// real, sizeable drop, not routine churn.
const MIN_EXPECTED_TEST_FILES = 20;

function assertSuspiciouslyFewTestFilesWerentCollected(): void {
  const count = countTestFiles(join(PACKAGE_DIR, "src"));
  if (count < MIN_EXPECTED_TEST_FILES) {
    throw new Error(
      `Only found ${count} "*.test.mts" files under src/ (expected at least ${MIN_EXPECTED_TEST_FILES}). ` +
        `Something is excluding test files from this run — check vitest's config and any per-file import ` +
        `errors before trusting a "passing" result.`,
    );
  }
}

function countTestFiles(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith(".test.mts")) {
      count += 1;
    }
  }
  return count;
}

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
  assertNodeVersionMatchesNvmrc();
  assertSuspiciouslyFewTestFilesWerentCollected();

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
