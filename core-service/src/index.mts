// Boot order matters: topics must exist in Kafka before the cron
// dispatcher (or any other service) tries to produce to them, and before
// this service's own HTTP server starts accepting health checks.
import { createServer } from "@transport/core/server";
import serverConfig from "./config/server.mjs";
import { kafkaAdmin } from "./resources.mjs";
import { startCrons } from "./cron.mjs";

await kafkaAdmin.ensureTopics();
startCrons();

const server = createServer(await serverConfig());
await server.listen();

async function shutdown() {
  await kafkaAdmin.stop();
  await server.stop();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
