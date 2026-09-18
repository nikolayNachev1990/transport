// App bootstrap: connect to this service's own Postgres + Kafka, then
// start the HTTP server (which scans src/**/rest/* itself — see
// config/server.mts).
import { createServer } from "@transport/core/server";
import { db, broker } from "./resources.mjs";
import serverConfig from "./config/server.mjs";

const server = createServer(await serverConfig());
await server.listen();

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  await server.stop();
  await broker.stop();
  await db.stop();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
