import { fileURLToPath } from "node:url";
import path from "node:path";

export function testDatabaseUrl(): string {
  const url = process.env["TEST_DATABASE_URL"];
  if (url === undefined || url === "") {
    throw new Error(
      "TEST_DATABASE_URL is not set. Start the test database with " +
        "`docker compose -f docker-compose.test.yml up -d` and export " +
        "TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/tms_test",
    );
  }
  return url;
}

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));

export const MIGRATIONS_DIR = path.join(fixturesDir, "migrations");
export const CLI_MIGRATIONS_DIR = path.join(fixturesDir, "cli-migrations");
