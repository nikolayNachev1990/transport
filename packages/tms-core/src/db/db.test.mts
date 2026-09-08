import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError, ErrorCode } from "tms-contracts";
import { runWithContext } from "../logger/context.mjs";
import { createDb, type Db } from "./db.mjs";
import { defineTable, type BaseRow, type TenantScopedRow } from "./table.mjs";
import { testDatabaseUrl } from "./__fixtures__/test-db.mjs";

interface Widget extends TenantScopedRow {
  name: string;
}
const widgetsTable = defineTable<Widget>("test_widgets", { tenantScoped: true });

interface WidgetEvent extends TenantScopedRow {
  widget_id: string;
  payload: string;
}
const widgetEventsTable = defineTable<WidgetEvent>("test_widget_events", { tenantScoped: true });

interface GlobalSetting extends BaseRow {
  key: string;
  value: string;
}
const globalSettingsTable = defineTable<GlobalSetting>("test_global_settings", { tenantScoped: false });

let db: Db;

// Schema is created/dropped once for the whole test run by
// vitest.global-setup.mts, not per file — see its comment for why.
beforeAll(() => {
  db = createDb({ connectionString: testDatabaseUrl() });
});

afterAll(async () => {
  await db.destroy();
});

describe("tenant enforcement (requirement 1)", () => {
  it("throws DB_TENANT_CONTEXT_MISSING for a tenantScoped table with no context", async () => {
    await expect(db.findMany(widgetsTable)).rejects.toMatchObject({ code: ErrorCode.DB_TENANT_CONTEXT_MISSING });
    await expect(db.insert(widgetsTable, { name: "x" })).rejects.toMatchObject({
      code: ErrorCode.DB_TENANT_CONTEXT_MISSING,
    });
  });

  it("does not require a tenant context for a non-tenantScoped table", async () => {
    const rows = await db.findMany(globalSettingsTable);
    expect(Array.isArray(rows)).toBe(true);
  });

  it("takes tenant_id from context automatically — two tenants stay isolated, even by guessed id", async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();

    const widgetA = await runWithContext({ tenantId: tenantA }, () => db.insert(widgetsTable, { name: "Widget A" }));
    await runWithContext({ tenantId: tenantB }, () => db.insert(widgetsTable, { name: "Widget B" }));

    const seenByA = await runWithContext({ tenantId: tenantA }, () => db.findMany(widgetsTable));
    expect(seenByA.map((widget) => widget.name)).toEqual(["Widget A"]);

    const foundByWrongTenant = await runWithContext({ tenantId: tenantB }, () =>
      db.findById(widgetsTable, widgetA.id),
    );
    expect(foundByWrongTenant).toBeNull();
  });
});

describe("rawUnsafe (requirement 2)", () => {
  it("has no `raw` method — only the explicitly-named escape hatch", () => {
    expect((db as unknown as Record<string, unknown>)["raw"]).toBeUndefined();
    expect(typeof db.rawUnsafe).toBe("function");
  });

  it("runs arbitrary SQL", async () => {
    const result = await db.rawUnsafe<{ rows: { one: number }[] }>("select 1 as one");
    expect(result.rows[0]?.one).toBe(1);
  });
});

describe("withTransaction (requirement 3)", () => {
  it("commits every write together on success", async () => {
    const tenantId = randomUUID();

    const widget = await runWithContext({ tenantId }, () =>
      db.withTransaction(async () => {
        const createdWidget = await db.insert(widgetsTable, { name: "Committed Widget" });
        await db.insert(widgetEventsTable, { widget_id: createdWidget.id, payload: "created" });
        return createdWidget;
      }),
    );

    const found = await runWithContext({ tenantId }, () => db.findById(widgetsTable, widget.id));
    const events = await runWithContext({ tenantId }, () => db.findMany(widgetEventsTable));
    expect(found?.name).toBe("Committed Widget");
    expect(events).toHaveLength(1);
  });

  it("rolls back every write together when a later step throws — the business row and the outbox-shaped row both vanish", async () => {
    const tenantId = randomUUID();

    await expect(
      runWithContext({ tenantId }, () =>
        db.withTransaction(async () => {
          const widget = await db.insert(widgetsTable, { name: "Rollback Widget" });
          await db.insert(widgetEventsTable, { widget_id: widget.id, payload: "created" });
          throw new Error("simulated failure after both writes");
        }),
      ),
    ).rejects.toThrow("simulated failure");

    const widgets = await runWithContext({ tenantId }, () => db.findMany(widgetsTable));
    const events = await runWithContext({ tenantId }, () => db.findMany(widgetEventsTable));
    expect(widgets).toEqual([]);
    expect(events).toEqual([]);
  });
});

describe("Postgres error translation (requirement 4)", () => {
  it("translates a real unique violation into DB_UNIQUE_VIOLATION, nothing raw leaking", async () => {
    const tenantId = randomUUID();
    await runWithContext({ tenantId }, () => db.insert(widgetsTable, { name: "Dup" }));

    try {
      await runWithContext({ tenantId }, () => db.insert(widgetsTable, { name: "Dup" }));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.DB_UNIQUE_VIOLATION);
      expect(error).not.toHaveProperty("severity");
      expect(error).not.toHaveProperty("detail");
    }
  });

  it("translates a real foreign key violation into DB_FOREIGN_KEY_VIOLATION", async () => {
    const tenantId = randomUUID();
    await expect(
      runWithContext({ tenantId }, () =>
        db.insert(widgetEventsTable, { widget_id: randomUUID(), payload: "orphan" }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.DB_FOREIGN_KEY_VIOLATION });
  });
});

describe("pool/timeout configuration (requirement 5)", () => {
  it("applies the configured statement_timeout as a real session setting", async () => {
    const timeoutDb = createDb({ connectionString: testDatabaseUrl(), statementTimeoutMs: 500 });
    try {
      const shown = await timeoutDb.rawUnsafe<{ rows: { statement_timeout: string }[] }>("show statement_timeout");
      expect(shown.rows[0]?.statement_timeout).toBe("500ms");
    } finally {
      await timeoutDb.destroy();
    }
  });

  it("actually cancels a query that exceeds statement_timeout, translated, not raw", async () => {
    const timeoutDb = createDb({ connectionString: testDatabaseUrl(), statementTimeoutMs: 300 });
    try {
      await expect(timeoutDb.rawUnsafe("select pg_sleep(2)")).rejects.toBeInstanceOf(AppError);
    } finally {
      await timeoutDb.destroy();
    }
  });

  it("applies the configured idle_in_transaction_session_timeout as a real session setting", async () => {
    const timeoutDb = createDb({ connectionString: testDatabaseUrl(), idleInTransactionTimeoutMs: 1234 });
    try {
      const shown = await timeoutDb.rawUnsafe<{ rows: { idle_in_transaction_session_timeout: string }[] }>(
        "show idle_in_transaction_session_timeout",
      );
      expect(shown.rows[0]?.idle_in_transaction_session_timeout).toBe("1234ms");
    } finally {
      await timeoutDb.destroy();
    }
  });

  it("enforces the configured pool max — a 3rd concurrent query queues behind a limit of 2", async () => {
    const smallPoolDb = createDb({ connectionString: testDatabaseUrl(), poolMin: 1, poolMax: 2 });
    try {
      const startedAt = Date.now();
      await Promise.all([
        smallPoolDb.rawUnsafe("select pg_sleep(0.3)"),
        smallPoolDb.rawUnsafe("select pg_sleep(0.3)"),
        smallPoolDb.rawUnsafe("select pg_sleep(0.3)"),
      ]);
      const elapsedMs = Date.now() - startedAt;

      expect(elapsedMs).toBeGreaterThanOrEqual(550);
    } finally {
      await smallPoolDb.destroy();
    }
  });
});

describe("basic CRUD surface", () => {
  it("updateById, count, exists, paginate, softDelete, deleteById, insertMany behave as expected", async () => {
    const tenantId = randomUUID();

    await runWithContext({ tenantId }, async () => {
      const inserted = await db.insertMany(widgetsTable, [{ name: "A" }, { name: "B" }, { name: "C" }]);
      expect(inserted).toHaveLength(3);

      expect(await db.count(widgetsTable)).toBe(3);
      expect(await db.exists(widgetsTable, { name: "A" })).toBe(true);
      expect(await db.exists(widgetsTable, { name: "nope" })).toBe(false);

      const page1 = await db.paginate(widgetsTable, {}, { page: 1, pageSize: 2 });
      expect(page1.rows).toHaveLength(2);
      expect(page1.total).toBe(3);

      const first = inserted[0];
      if (first === undefined) throw new Error("expected an inserted row");

      const updated = await db.updateById(widgetsTable, first.id, { name: "A2" });
      expect(updated?.name).toBe("A2");

      const softDeleted = await db.softDelete(widgetsTable, first.id, { name: "A3" });
      expect(softDeleted?.name).toBe("A3");

      const deleted = await db.deleteById(widgetsTable, first.id);
      expect(deleted).toBe(true);
      expect(await db.findById(widgetsTable, first.id)).toBeNull();
    });
  });
});
