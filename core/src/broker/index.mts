import { Kafka, Partitioners, logLevel, type Producer, type Consumer } from "kafkajs";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import type { Db } from "../db/index.mjs";
import { validate } from "../validator/index.mjs";
import { createHistory, type History, type BrokerEvent } from "./history.mjs";
import { createFailedQueue, type FailedQueue, type FailedQueueConfig } from "./failed.mjs";
import { localGroupSettings } from "./local.mjs";

export type { BrokerEvent } from "./history.mjs";

export type ConsumerMode = "one" | "all";
export type ConsumerCallback = (event: BrokerEvent) => Promise<void>;

export interface EventSchemaEntry {
  header: { properties?: Record<string, unknown> };
  body: { properties?: Record<string, unknown> };
  producers: string[];
  consumers: Record<string, { mode: ConsumerMode }>;
}

export interface SyncMapEntry {
  table: string;
  action: "insert" | "update" | "delete";
}

export interface BrokerConfig {
  group: string;
  groupId?: string;
  brokers: string[];
  schema: Record<string, EventSchemaEntry>;
  consumers?: Record<string, ConsumerCallback>;
  sync?: { map: Record<string, SyncMapEntry> };
  failed?: FailedQueueConfig;
  ssl?: { caFile: string; keyFile: string; certFile: string };
}

export interface Broker {
  send(topic: string, body: unknown, header?: Record<string, unknown>): Promise<boolean>;
  history(): History;
  stop(): Promise<void>;
}

function readSslOptions(ssl: BrokerConfig["ssl"]) {
  if (!ssl) return undefined;
  if (!fs.existsSync(ssl.caFile) || !fs.existsSync(ssl.keyFile) || !fs.existsSync(ssl.certFile)) {
    return undefined;
  }
  return {
    rejectUnauthorized: true,
    ca: [fs.readFileSync(ssl.caFile, "utf-8")],
    key: fs.readFileSync(ssl.keyFile, "utf-8"),
    cert: fs.readFileSync(ssl.certFile, "utf-8"),
  };
}

function validateEvent(schema: Record<string, EventSchemaEntry>, topic: string, event: BrokerEvent): boolean {
  const entry = schema[topic];
  if (!entry) return false;

  if (entry.header.properties && Object.keys(entry.header.properties).length > 0) {
    const errors = validate(event.header, entry.header, null);
    if (errors) {
      console.log(`broker: event "${topic}" (header) validation error`, errors);
      return false;
    }
  }

  if (entry.body.properties && Object.keys(entry.body.properties).length > 0) {
    const errors = validate(event.body, entry.body, null);
    if (errors) {
      console.log(`broker: event "${topic}" (body) validation error`, errors);
      return false;
    }
  }

  return true;
}

function syncCallback(db: Db, entry: SyncMapEntry): ConsumerCallback {
  return async (event) => {
    const body = event.body as Record<string, unknown> & { id?: string | number };
    if (entry.action === "insert") await db.insert(entry.table, body);
    if (entry.action === "update" && body.id !== undefined) await db.updateById(entry.table, body.id, body);
    if (entry.action === "delete" && body.id !== undefined) await db.deleteById(entry.table, body.id);
  };
}

export async function createBroker(config: BrokerConfig, deps: { db?: Db } = {}): Promise<Broker> {
  const history = createHistory();
  const failedQueue: FailedQueue | null = config.failed ? createFailedQueue(config.failed) : null;

  // No configured groupId falls back to one cached in a local dotfile, not a
  // fresh random one each boot — a random groupId every restart would mean
  // losing the consumer's committed Kafka offsets every time.
  const groupId = config.groupId ?? localGroupSettings(config.group).groupId;

  const produceTopics: string[] = [];
  const consumeTopics: Record<ConsumerMode, string[]> = { one: [], all: [] };
  const callbacks: Record<ConsumerMode, Record<string, ConsumerCallback>> = { one: {}, all: {} };

  for (const [topic, entry] of Object.entries(config.schema)) {
    if (entry.producers.includes(config.group)) {
      produceTopics.push(topic);
    }

    const ownConsumer = entry.consumers[config.group];
    if (!ownConsumer) continue;

    const mode = ownConsumer.mode;
    let callback = config.consumers?.[topic];
    if (!callback && config.sync?.map[topic]) {
      if (!deps.db) {
        throw new Error(`broker: sync map for "${topic}" needs a db, none was provided`);
      }
      callback = syncCallback(deps.db, config.sync.map[topic]);
    }
    if (!callback) {
      throw new Error(`broker: consumer callback for "${topic}" is missing`);
    }

    consumeTopics[mode].push(topic);
    callbacks[mode][topic] = callback;
  }

  const sslOptions = readSslOptions(config.ssl);
  const client = new Kafka({
    clientId: `${config.group}-${randomUUID()}`,
    brokers: config.brokers,
    logLevel: logLevel.ERROR,
    enforceRequestTimeout: false,
    ...(sslOptions ? { ssl: sslOptions } : {}),
  });

  if (failedQueue) {
    const pending = await failedQueue.pullAll();
    for (const item of pending) {
      const callback = callbacks.one[item.topic] ?? callbacks.all[item.topic];
      if (!callback) {
        console.log(`broker: no callback to retry failed message for "${item.topic}"`);
        continue;
      }
      try {
        await callback({ header: {}, body: item.data });
      } catch (error) {
        console.log(`broker: retry failed again for "${item.topic}"`, error);
        await failedQueue.push(item.topic, item.data, error);
      }
    }
  }

  const producer: Producer = client.producer({ createPartitioner: Partitioners.DefaultPartitioner });
  await producer.connect();

  async function consuming(topic: string, message: { value: Buffer | null }): Promise<void> {
    const mode: ConsumerMode | null = consumeTopics.one.includes(topic)
      ? "one"
      : consumeTopics.all.includes(topic)
        ? "all"
        : null;
    if (!mode) throw new Error(`broker: not defined consuming topic "${topic}"`);

    const callback = callbacks[mode][topic];
    if (!callback) throw new Error(`broker: not defined consumer callback for "${topic}"`);

    const event = JSON.parse((message.value ?? Buffer.from("{}")).toString()) as BrokerEvent;
    if (!validateEvent(config.schema, topic, event)) {
      throw new Error(`broker: "${topic}" validation failed`);
    }

    console.log(`broker: received "${topic}"`);
    await callback(event);
    history.consume(topic, event);
  }

  async function runConsumer(mode: ConsumerMode): Promise<Consumer | null> {
    if (consumeTopics[mode].length === 0) return null;

    const consumer = client.consumer({
      groupId: mode === "one" ? config.group : groupId,
      sessionTimeout: 30000,
      rebalanceTimeout: 60000,
      maxWaitTimeInMs: 500,
      heartbeatInterval: 3000,
    });
    await consumer.connect();
    await consumer.subscribe({ topics: consumeTopics[mode], fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          await consuming(topic, message);
        } catch (error) {
          if (failedQueue) {
            try {
              const data = JSON.parse((message.value ?? Buffer.from("{}")).toString());
              await failedQueue.push(topic, data, error);
            } catch {
              // message wasn't valid JSON — nothing more we can do with it
            }
          }
          console.log(`broker: consumer callback "${topic}" error`, error);
        }
      },
    });
    return consumer;
  }

  const consumerOne = await runConsumer("one");
  const consumerAll = await runConsumer("all");

  return {
    async send(topic, body, header = {}) {
      if (!produceTopics.includes(topic)) {
        console.log(`broker: not defined topic "${topic}" in producing topics`);
        return false;
      }

      const event: BrokerEvent = { header, body };
      if (!validateEvent(config.schema, topic, event)) {
        return false;
      }

      try {
        await producer.send({
          topic,
          messages: [{ key: randomUUID(), value: JSON.stringify(event) }],
        });
        history.produce(topic, event);
        return true;
      } catch (error) {
        console.log(`broker: produce error for "${topic}"`, error);
        return false;
      }
    },

    history() {
      return history;
    },

    async stop() {
      if (consumerOne) await consumerOne.disconnect();
      if (consumerAll) await consumerAll.disconnect();
      await producer.disconnect();
    },
  };
}
