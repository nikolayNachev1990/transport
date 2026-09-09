import type { ConnectionOptions } from "bullmq";

export function testBullmqConnection(): ConnectionOptions {
  const url = process.env["TEST_REDIS_URL"];
  if (url === undefined || url === "") {
    throw new Error(
      "TEST_REDIS_URL is not set. Start test infra with " +
        "`docker compose -f docker-compose.test.yml up -d` and export " +
        "TEST_REDIS_URL=redis://localhost:56379",
    );
  }
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port),
    // BullMQ requires this exact setting on the connection it's given.
    maxRetriesPerRequest: null,
  };
}
