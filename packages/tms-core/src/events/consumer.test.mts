import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EventRegistry } from "tms-contracts";
import { createDb, type Db } from "../db/db.mjs";
import { runWithContext } from "../logger/context.mjs";
import { testDatabaseUrl, testKafkaBrokers } from "./__fixtures__/test-env.mjs";
import { createEventPublisher } from "./publisher.mjs";
import { createKafkaProducer, relayTick, type EventProducer } from "./relay.mjs";
import { createEventConsumer } from "./consumer.mjs";
import type { EventEnvelope } from "tms-contracts";

const REGISTRY: EventRegistry = {
  "widget.created": {
    schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    version: 1,
    producers: ["widget-service"],
    consumers: ["query-service"],
  },
};

let db: Db;
let producer: EventProducer;

beforeAll(async () => {
  db = createDb({ connectionString: testDatabaseUrl() });
  producer = createKafkaProducer({ brokers: testKafkaBrokers() });
  await producer.connect();
});

afterAll(async () => {
  await producer.disconnect();
  await db.destroy();
});

describe("createEventConsumer: end-to-end through outbox -> relay -> Kafka -> consumer", () => {
  it("dispatches a real published event to the matching handler by event_type", async () => {
    const topic = `test-events-${randomUUID()}`;
    const tenantId = randomUUID();
    const aggregateId = randomUUID();
    const publisher = createEventPublisher({ serviceName: "widget-service", events: ["widget.created"], registry: REGISTRY, db });

    await runWithContext({ tenantId }, () =>
      db.withTransaction(() => publisher.publish("widget.created", aggregateId, { name: "consumed-widget" })),
    );
    await relayTick({ db, producer, topic });

    const received: EventEnvelope[] = [];
    const consumer = createEventConsumer({
      brokers: testKafkaBrokers(),
      groupId: `test-consumer-${randomUUID()}`,
      topic,
      handlers: [{ eventType: "widget.created", handler: async (envelope) => void received.push(envelope) }],
    });

    const runPromise = consumer.run();
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await consumer.disconnect();
    await runPromise.catch(() => {});

    expect(received).toHaveLength(1);
    expect(received[0]?.header.event_type).toBe("widget.created");
    expect(received[0]?.header.aggregate_id).toBe(aggregateId);
    expect(received[0]?.body).toEqual({ name: "consumed-widget" });
  });
});
