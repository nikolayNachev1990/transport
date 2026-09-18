import path from "node:path";
import { globSync } from "glob";
import { pathToFileURL } from "node:url";
import { loadConfig, asList } from "@transport/core/config";
import type { BrokerConfig, EventSchemaEntry } from "@transport/core/broker";

const env = loadConfig(
  {
    KAFKA_BROKERS_HOSTS: { required: true, parse: asList, description: "Comma-separated Kafka broker hosts" },
    CORE_KAFKA_GROUP: { required: true, description: "Kafka consumer group name" },
    CORE_KAFKA_GROUP_ID: { required: false, description: "Kafka consumer groupId override" },
  },
  process.env,
);

// Same mechanism as auth-service/query-service's broker.mts — schemas
// live in the shared Events/ folder.
async function loadSchema(): Promise<Record<string, EventSchemaEntry>> {
  const eventsDir = path.resolve(process.cwd(), "Events");
  const files = globSync(path.join(eventsDir, "*.mjs"), {});
  const schema: Record<string, EventSchemaEntry> = {};
  for (const file of files) {
    const name = path.parse(file).name;
    const imported = await import(pathToFileURL(file).href);
    schema[name] = imported.default as EventSchemaEntry;
  }
  return schema;
}

// core-service doesn't consume anything itself — it only produces the
// scheduled cron-trigger events (see src/cron.mts), so no consumers map.
const consumers: BrokerConfig["consumers"] = {};

export default async function brokerConfig(): Promise<BrokerConfig> {
  return {
    group: env.CORE_KAFKA_GROUP,
    groupId: env.CORE_KAFKA_GROUP_ID,
    brokers: env.KAFKA_BROKERS_HOSTS,
    schema: await loadSchema(),
    consumers,
  };
}
