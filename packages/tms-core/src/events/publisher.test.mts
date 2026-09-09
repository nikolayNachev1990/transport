import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EventRegistry } from "tms-contracts";
import { AppError, ErrorCode } from "tms-contracts";
import { createDb, type Db } from "../db/db.mjs";
import { runWithContext } from "../logger/context.mjs";
import { testDatabaseUrl } from "./__fixtures__/test-env.mjs";
import { createEventPublisher } from "./publisher.mjs";
import { outboxTable } from "./outbox-table.mjs";

const TEST_REGISTRY: EventRegistry = {
  "widget.created": {
    schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
    version: 1,
    producers: ["widget-service"],
    consumers: ["query-service"],
  },
};

let db: Db;

beforeAll(() => {
  db = createDb({ connectionString: testDatabaseUrl() });
});

afterAll(async () => {
  await db.destroy();
});

// Requirement 1 (no Kafka client in the write module) used to be checked
// here by reading publisher.mts's own source for the substring "kafka" —
// fragile twice over: it flagged this very file's explanatory comments,
// and it couldn't have caught an indirect import (publisher.mts importing
// some other local file that itself pulled in a Kafka client). Replaced
// with an eslint.config.mjs `no-restricted-imports` rule covering every
// file under tms-core/src except relay.mts/consumer.mts — real, transitive
// enforcement via `pnpm lint`, not a text search in a unit test.

describe("requirement 7: a service not declared as a producer throws at startup", () => {
  it("throws immediately when creating the publisher, not on first publish()", () => {
    expect(() =>
      createEventPublisher({ serviceName: "some-other-service", events: ["widget.created"], registry: TEST_REGISTRY, db }),
    ).toThrow(/not a declared producer/);
  });

  it("throws for an event type that isn't in the registry at all", () => {
    expect(() =>
      createEventPublisher({ serviceName: "widget-service", events: ["nonexistent.event"], registry: TEST_REGISTRY, db }),
    ).toThrow(/Unknown event type/);
  });

  it("succeeds for a correctly declared producer", () => {
    expect(() =>
      createEventPublisher({ serviceName: "widget-service", events: ["widget.created"], registry: TEST_REGISTRY, db }),
    ).not.toThrow();
  });
});

describe("requirement 2: publish() outside withTransaction throws", () => {
  it("throws EVENT_PUBLISH_OUTSIDE_TRANSACTION when called with no active transaction", async () => {
    const publisher = createEventPublisher({
      serviceName: "widget-service",
      events: ["widget.created"],
      registry: TEST_REGISTRY,
      db,
    });
    const tenantId = randomUUID();

    await runWithContext({ tenantId }, async () => {
      await expect(publisher.publish("widget.created", randomUUID(), { name: "x" })).rejects.toMatchObject({
        code: ErrorCode.EVENT_PUBLISH_OUTSIDE_TRANSACTION,
      });
    });
  });

  it("succeeds when called inside withTransaction", async () => {
    const publisher = createEventPublisher({
      serviceName: "widget-service",
      events: ["widget.created"],
      registry: TEST_REGISTRY,
      db,
    });
    const tenantId = randomUUID();
    const aggregateId = randomUUID();

    await runWithContext({ tenantId }, () =>
      db.withTransaction(() => publisher.publish("widget.created", aggregateId, { name: "Widget A" })),
    );

    const rows = await runWithContext({ tenantId }, () => db.findMany(outboxTable, { aggregate_id: aggregateId }));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.published_at).toBeNull();
  });
});

describe("requirement 6: schema is validated at publish(), not at consume time", () => {
  it("rejects a body that fails the declared schema, and nothing lands in outbox", async () => {
    const publisher = createEventPublisher({
      serviceName: "widget-service",
      events: ["widget.created"],
      registry: TEST_REGISTRY,
      db,
    });
    const tenantId = randomUUID();
    const aggregateId = randomUUID();

    await runWithContext({ tenantId }, () =>
      db.withTransaction(async () => {
        await expect(
          publisher.publish("widget.created", aggregateId, { wrong_field: 123 }),
        ).rejects.toBeInstanceOf(AppError);
      }),
    );

    const rows = await runWithContext({ tenantId }, () => db.findMany(outboxTable, { aggregate_id: aggregateId }));
    expect(rows).toHaveLength(0);
  });

  it("rejects publishing an event type this publisher never declared", async () => {
    const publisher = createEventPublisher({
      serviceName: "widget-service",
      events: ["widget.created"],
      registry: TEST_REGISTRY,
      db,
    });
    const tenantId = randomUUID();

    await runWithContext({ tenantId }, () =>
      db.withTransaction(async () => {
        await expect(publisher.publish("widget.deleted", randomUUID(), {})).rejects.toMatchObject({
          code: ErrorCode.EVENT_NOT_DECLARED,
        });
      }),
    );
  });
});
