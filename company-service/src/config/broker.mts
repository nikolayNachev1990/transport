import path from "node:path";
import { globSync } from "glob";
import { pathToFileURL } from "node:url";
import { loadConfig, asList } from "@transport/core/config";
import type { BrokerConfig, ConsumerCallback, EventSchemaEntry } from "@transport/core/broker";

const env = loadConfig(
  {
    KAFKA_BROKERS_HOSTS: { required: true, parse: asList, description: "Comma-separated Kafka broker hosts" },
    COMPANY_KAFKA_GROUP: { required: true, description: "Kafka consumer group name" },
    COMPANY_KAFKA_GROUP_ID: { required: false, description: "Kafka consumer groupId override" },
  },
  process.env,
);

// Schemas live in the shared Events/ folder (copied in by the Dockerfile,
// sibling of src/, core/, langs/), not an external "zikvid-schema" package.
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

// Same scan-by-convention mechanism as server.mts's REST loader, but for
// src/**/events/*.mts — each file's default export is the consumer
// callback, keyed by its own filename (which is the topic name).
async function loadConsumers(): Promise<Record<string, ConsumerCallback>> {
  const isDev = process.argv[1]?.endsWith(".mts") ?? false;
  const eventsSrcDir = path.resolve(process.cwd(), isDev ? "src" : "dist");
  const extension = isDev ? "mts" : "mjs";
  const files = globSync(path.join(eventsSrcDir, `**/events/*.${extension}`), {});

  const consumers: Record<string, ConsumerCallback> = {};
  for (const file of files) {
    const name = path.parse(file).name;
    const imported = await import(pathToFileURL(file).href);
    consumers[name] = imported.default as ConsumerCallback;
  }
  return consumers;
}

export default async function brokerConfig(): Promise<BrokerConfig> {
  return {
    group: env.COMPANY_KAFKA_GROUP,
    groupId: env.COMPANY_KAFKA_GROUP_ID,
    brokers: env.KAFKA_BROKERS_HOSTS,
    schema: await loadSchema(),
    consumers: await loadConsumers(),
  };
}
