// Minimal boot: connect to this service's own Postgres + Kafka, and
// expose /health so docker-compose's healthcheck has something to hit.
// No REST handlers or event consumers yet — see broker.mts for why.
import { createServer } from "@transport/core/server";
import serverConfig from "./config/server.mjs";
import "./resources.mjs";

const server = createServer(await serverConfig());
await server.listen();

async function shutdown() {
  await server.stop();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
