import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/db.mjs";
import { runWithContext } from "../logger/context.mjs";
import { testDatabaseUrl } from "./__fixtures__/test-env.mjs";
import { outboxTable } from "./outbox-table.mjs";
import { cleanupPublishedOutboxRows } from "./cleanup.mjs";

let db: Db;

beforeAll(() => {
  db = createDb({ connectionString: testDatabaseUrl() });
});

afterAll(async () => {
  await db.destroy();
});

describe("requirement 8: cleanup strategy for published outbox rows", () => {
  it("deletes only rows that are both published and older than the retention window", async () => {
    const tenantId = randomUUID();

    // Sequential, not Promise.all: everything inside one withTransaction
    // shares a single Postgres connection, which can only run one query at
    // a time — concurrent queries on it trigger pg's "already executing a
    // query" deprecation warning and aren't actually parallel anyway.
    const [oldPublished, recentPublished, unpublished] = await runWithContext({ tenantId }, () =>
      db.withTransaction(async () => {
        const first = await db.insert(outboxTable, {
          aggregate_id: randomUUID(),
          event_type: "widget.created",
          version: 1,
          payload: {},
          published_at: null,
        });
        const second = await db.insert(outboxTable, {
          aggregate_id: randomUUID(),
          event_type: "widget.created",
          version: 1,
          payload: {},
          published_at: null,
        });
        const third = await db.insert(outboxTable, {
          aggregate_id: randomUUID(),
          event_type: "widget.created",
          version: 1,
          payload: {},
          published_at: null,
        });
        return [first, second, third] as const;
      }),
    );

    // backdate the first row's published_at well outside the retention
    // window, mark the second as recently published, leave the third alone
    await db.rawUnsafe(`UPDATE outbox SET published_at = now() - interval '10 days' WHERE id = ?`, [oldPublished.id]);
    await db.rawUnsafe(`UPDATE outbox SET published_at = now() WHERE id = ?`, [recentPublished.id]);

    const deletedCount = await cleanupPublishedOutboxRows(db, { olderThanMs: 24 * 60 * 60 * 1000 });
    expect(deletedCount).toBeGreaterThanOrEqual(1);

    const remaining = await runWithContext({ tenantId }, () => db.findMany(outboxTable));
    const remainingIds = remaining.map((row) => row.id);
    expect(remainingIds).not.toContain(oldPublished.id);
    expect(remainingIds).toContain(recentPublished.id);
    expect(remainingIds).toContain(unpublished.id);
  });

  it("does not delete unpublished rows regardless of age", async () => {
    const tenantId = randomUUID();
    const row = await runWithContext({ tenantId }, () =>
      db.withTransaction(() =>
        db.insert(outboxTable, {
          aggregate_id: randomUUID(),
          event_type: "widget.created",
          version: 1,
          payload: {},
          published_at: null,
        }),
      ),
    );
    await db.rawUnsafe(`UPDATE outbox SET created_at = now() - interval '100 days' WHERE id = ?`, [row.id]);

    await cleanupPublishedOutboxRows(db, { olderThanMs: 1000 });

    const found = await runWithContext({ tenantId }, () => db.findById(outboxTable, row.id));
    expect(found).not.toBeNull();
  });
});
