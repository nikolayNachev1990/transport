import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KafkaJS } from "@confluentinc/kafka-javascript";
import type { EventRegistry } from "tms-contracts";
import { createDb, type Db } from "../db/db.mjs";
import { defineTable, type TenantScopedRow } from "../db/table.mjs";
import { runWithContext } from "../logger/context.mjs";
import { testDatabaseUrl, testKafkaBrokers } from "./__fixtures__/test-env.mjs";
import { createEventPublisher } from "./publisher.mjs";
import { outboxTable } from "./outbox-table.mjs";
import { createKafkaProducer, relayTick, type EventProducer } from "./relay.mjs";

const REDPANDA_CONTAINER = "tms-core-redpanda-1";

interface Widget extends TenantScopedRow {
  name: string;
}
const widgetsTable = defineTable<Widget>("test_widgets", { tenantScoped: true });

const REGISTRY: EventRegistry = {
  "widget.created": {
    schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    version: 1,
    producers: ["widget-service"],
    consumers: [],
  },
  "widget.status_changed": {
    schema: { type: "object", properties: { status: { type: "string" } }, required: ["status"] },
    version: 1,
    producers: ["widget-service"],
    consumers: [],
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectMessages(topic: string, count: number, timeoutMs = 8000): Promise<{ key: string; value: string }[]> {
  const kafka = new KafkaJS.Kafka({ kafkaJS: { brokers: testKafkaBrokers() } });
  const consumer = kafka.consumer({ kafkaJS: { groupId: `test-${randomUUID()}`, fromBeginning: true } });
  await consumer.connect();
  await consumer.subscribe({ topic });

  const messages: { key: string; value: string }[] = [];
  let resolveDone: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  await consumer.run({
    eachMessage: ({ message }) => {
      messages.push({ key: message.key?.toString() ?? "", value: message.value?.toString() ?? "" });
      if (messages.length >= count) {
        resolveDone();
      }
      return Promise.resolve();
    },
  });

  await Promise.race([done, delay(timeoutMs)]);
  await consumer.disconnect();
  return messages;
}

describe("requirement 1/3: publisher has zero coupling to the relay's execution", () => {
  it("publisher.mts does not import relay.mts, relay-runner.mts, or bin.mts", () => {
    const source = readFileSync(fileURLToPath(new URL("./publisher.mts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/from ["'].\/relay/);
    expect(source).not.toMatch(/from ["'].\/bin/);
  });
});

describe("requirement 4: SELECT ... FOR UPDATE SKIP LOCKED — two relay instances don't duplicate", () => {
  it("publishes each of N pending events exactly once when several relay ticks race concurrently", async () => {
    const topic = `test-events-${randomUUID()}`;
    const tenantId = randomUUID();
    const publisher = createEventPublisher({ serviceName: "widget-service", events: ["widget.created"], registry: REGISTRY, db });
    const aggregateIds = Array.from({ length: 8 }, () => randomUUID());

    await runWithContext({ tenantId }, () =>
      db.withTransaction(async () => {
        for (const aggregateId of aggregateIds) {
          await publisher.publish("widget.created", aggregateId, { name: "concurrent" });
        }
      }),
    );

    // simulate 4 relay instances racing over the same backlog at once
    const results = await Promise.all(
      Array.from({ length: 4 }, () => relayTick({ db, producer, topic, maxAggregatesPerTick: 8 })),
    );
    const totalClaimedByRelay = results.reduce((sum, n) => sum + n, 0);
    expect(totalClaimedByRelay).toBe(8);

    const messages = await collectMessages(topic, 8);
    expect(messages).toHaveLength(8);
    expect(new Set(messages.map((m) => m.key)).size).toBe(8);
  });
});

describe("requirement 5: aggregate_id ordering is preserved by the relay itself", () => {
  it("publishes created before status_changed for the same aggregate, even under concurrent relay workers", async () => {
    const topic = `test-events-${randomUUID()}`;
    const tenantId = randomUUID();
    const aggregateId = randomUUID();
    const publisher = createEventPublisher({
      serviceName: "widget-service",
      events: ["widget.created", "widget.status_changed"],
      registry: REGISTRY,
      db,
    });

    await runWithContext({ tenantId }, () =>
      db.withTransaction(() => publisher.publish("widget.created", aggregateId, { name: "x" })),
    );
    await delay(10); // guarantee a distinct created_at from the first event
    await runWithContext({ tenantId }, () =>
      db.withTransaction(() => publisher.publish("widget.status_changed", aggregateId, { status: "in_transit" })),
    );

    // several concurrent ticks, as if two relay instances were both running —
    // ordering must hold regardless of which instance handles which turn
    for (let round = 0; round < 4; round += 1) {
      await Promise.all([relayTick({ db, producer, topic }), relayTick({ db, producer, topic })]);
    }

    const messages = await collectMessages(topic, 2);
    const eventTypes = messages.map((m) => (JSON.parse(m.value) as { header: { event_type: string } }).header.event_type);
    expect(eventTypes).toEqual(["widget.created", "widget.status_changed"]);
  });
});

describe("proof: commit failure loses both the business row and the event", () => {
  it("a thrown error after publish() inside the same transaction rolls back the business row and the outbox row together", async () => {
    const tenantId = randomUUID();

    await expect(
      runWithContext({ tenantId }, () =>
        db.withTransaction(async () => {
          const widget = await db.insert(widgetsTable, { name: "Should not survive commit failure" });
          const publisher = createEventPublisher({
            serviceName: "widget-service",
            events: ["widget.created"],
            registry: REGISTRY,
            db,
          });
          await publisher.publish("widget.created", widget.id, { name: widget.name });
          throw new Error("simulated failure after both writes");
        }),
      ),
    ).rejects.toThrow("simulated failure");

    const widgets = await runWithContext({ tenantId }, () => db.findMany(widgetsTable));
    const outboxRows = await runWithContext({ tenantId }, () => db.findMany(outboxTable));
    expect(widgets).toEqual([]);
    expect(outboxRows).toEqual([]);
  });
});

describe("proof: an event published while the broker is down comes out once it's back up", () => {
  it(
    "survives a broker outage without loss or duplication",
    async () => {
      const topic = `test-events-${randomUUID()}`;
      const tenantId = randomUUID();
      const aggregateId = randomUUID();
      const publisher = createEventPublisher({ serviceName: "widget-service", events: ["widget.created"], registry: REGISTRY, db });

      await runWithContext({ tenantId }, () =>
        db.withTransaction(() => publisher.publish("widget.created", aggregateId, { name: "resilience" })),
      );

      // Its own short-timeout producer, not the shared file-level one:
      // librdkafka's message.timeout.ms defaults to 5 minutes, so a send()
      // against a down broker would otherwise hang the whole test instead
      // of failing fast.
      const outageProducer = createKafkaProducer({ brokers: testKafkaBrokers(), messageTimeoutMs: 3000 });
      await outageProducer.connect();

      execSync(`docker stop ${REDPANDA_CONTAINER}`, { stdio: "ignore" });
      try {
        // the broker is down: relayTick must not mark the row published,
        // whatever error the producer throws
        const publishedWhileDown = await relayTick({ db, producer: outageProducer, topic, maxAggregatesPerTick: 1 });
        expect(publishedWhileDown).toBe(0);

        const stillPending = await runWithContext({ tenantId }, () => db.findMany(outboxTable, { aggregate_id: aggregateId }));
        expect(stillPending[0]?.published_at).toBeNull();
      } finally {
        execSync(`docker start ${REDPANDA_CONTAINER}`, { stdio: "ignore" });
      }

      // wait for the broker to actually accept connections again
      let recovered = false;
      for (let attempt = 0; attempt < 30 && !recovered; attempt += 1) {
        try {
          execSync(`docker exec ${REDPANDA_CONTAINER} rpk cluster health`, { stdio: "ignore" });
          recovered = true;
        } catch {
          await delay(1000);
        }
      }
      expect(recovered).toBe(true);

      // A fresh producer for the recovery phase — the relay process in
      // production would be this same long-lived producer reconnecting on
      // its own via librdkafka's internal retry logic, but pinning that
      // exact behavior in a test is exactly the kind of thing that makes
      // tests flaky without proving anything more about our own code; what
      // matters here is what a real service instance would experience:
      // the *system* (relay + broker) recovers, an event published during
      // the outage is not lost, and is not duplicated either.
      const recoveryProducer = createKafkaProducer({ brokers: testKafkaBrokers(), messageTimeoutMs: 5000 });
      await recoveryProducer.connect();

      let published = 0;
      for (let attempt = 0; attempt < 20 && published === 0; attempt += 1) {
        published = await relayTick({ db, producer: recoveryProducer, topic, maxAggregatesPerTick: 1 });
        if (published === 0) {
          await delay(1000);
        }
      }
      await outageProducer.disconnect();
      await recoveryProducer.disconnect();
      expect(published).toBe(1);

      const messages = await collectMessages(topic, 1);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.key).toBe(aggregateId);
    },
    60_000,
  );
});
