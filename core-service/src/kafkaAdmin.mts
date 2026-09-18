// Separate from @transport/core/broker on purpose — admin/topic-creation
// is a one-time bootstrap concern only this service needs, not something
// every regular producer/consumer service should carry. core-service's
// whole job (besides the cron dispatcher in cron.mts) is making sure
// every topic Events/ declares actually exists in Kafka before any other
// service tries to produce/consume it.
import { Kafka, logLevel } from "kafkajs";
import { randomUUID } from "node:crypto";
import type { EventSchemaEntry } from "@transport/core/broker";

export interface KafkaAdmin {
  ensureTopics(): Promise<void>;
  checkTopicsHealth(): Promise<{ ok: boolean; missing: string[] }>;
  fetchTopicsOffsets(topics: string[]): Promise<Record<string, number>>;
  stop(): Promise<void>;
}

export async function createKafkaAdmin(brokers: string[], schema: Record<string, EventSchemaEntry>): Promise<KafkaAdmin> {
  const client = new Kafka({
    clientId: `core-service-${randomUUID()}`,
    brokers,
    connectionTimeout: 25000,
    enforceRequestTimeout: true,
    logLevel: logLevel.ERROR,
  });
  const admin = client.admin();
  await admin.connect();

  async function missingTopics(): Promise<string[]> {
    const available = await admin.listTopics();
    return Object.keys(schema).filter((name) => !available.includes(name));
  }

  return {
    async ensureTopics() {
      const missing = await missingTopics();
      if (missing.length === 0) return;
      console.log(`core-service: creating ${missing.length} missing topic(s): ${missing.join(", ")}`);
      await admin.createTopics({
        waitForLeaders: true,
        topics: missing.map((topic) => ({ topic, numPartitions: 10 })),
      });
    },

    async checkTopicsHealth() {
      const missing = await missingTopics();
      return { ok: missing.length === 0, missing };
    },

    async fetchTopicsOffsets(topics: string[]) {
      const results: Record<string, number> = {};
      for (const topic of topics) {
        const partitions = await admin.fetchTopicOffsets(topic);
        for (const partition of partitions) {
          const offset = Number(partition.high) - Number(partition.low);
          if (offset > 0) {
            results[`${topic}-${partition.partition}`] = offset;
          }
        }
      }
      return results;
    },

    async stop() {
      await admin.disconnect();
    },
  };
}
