import { fileURLToPath } from "node:url";
import path from "node:path";

export function testDatabaseUrl(): string {
  const url = process.env["TEST_DATABASE_URL"];
  if (url === undefined || url === "") {
    throw new Error(
      "TEST_DATABASE_URL is not set. Start test infra with " +
        "`docker compose -f docker-compose.test.yml up -d` and export " +
        "TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/tms_test",
    );
  }
  return url;
}

export function testKafkaBrokers(): string[] {
  const brokers = process.env["TEST_KAFKA_BROKERS"];
  if (brokers === undefined || brokers === "") {
    throw new Error(
      "TEST_KAFKA_BROKERS is not set. Start test infra with " +
        "`docker compose -f docker-compose.test.yml up -d` and export " +
        "TEST_KAFKA_BROKERS=localhost:59092",
    );
  }
  return brokers.split(",");
}

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));

export const MIGRATIONS_DIR = path.join(fixturesDir, "migrations");
