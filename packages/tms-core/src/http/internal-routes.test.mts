import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fastify, { type FastifyInstance } from "fastify";
import { createDb, type Db } from "../db/db.mjs";
import { defineTable, type TenantScopedRow } from "../db/table.mjs";
import { testDatabaseUrl } from "../db/__fixtures__/test-db.mjs";
import { runWithContext } from "../logger/context.mjs";
import { createErrorHandler } from "./error-handler.mjs";
import { registerInternalRoutes } from "./internal-routes.mjs";
import { createLogger } from "../logger/index.mjs";

interface Widget extends TenantScopedRow {
  name: string;
}
const widgetsTable = defineTable<Widget>("test_widgets", { tenantScoped: true });

const INTERNAL_SECRET = "test-internal-secret";
let db: Db;
let app: FastifyInstance;

// Schema is created/dropped once for the whole test run by
// vitest.global-setup.mts, not per file — see its comment for why.
beforeAll(() => {
  db = createDb({ connectionString: testDatabaseUrl() });

  app = fastify();
  app.setErrorHandler(createErrorHandler(createLogger("test", { destination: { write(): void {} } })));
  registerInternalRoutes(app, {
    db,
    internalSecret: INTERNAL_SECRET,
    snapshotTables: { widgets: widgetsTable },
  });
});

afterAll(async () => {
  await db.destroy();
});

describe("GET /internal/snapshot/:table (requirement 5)", () => {
  it("rejects a request with no X-Internal-Secret header", async () => {
    const response = await app.inject({ method: "GET", url: "/internal/snapshot/widgets" });
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: "INTERNAL_ROUTE_FORBIDDEN" } });
  });

  it("rejects a request with the wrong X-Internal-Secret", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/snapshot/widgets",
      headers: { "x-internal-secret": "wrong" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("404s for a table not in the declared snapshotTables", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/internal/snapshot/not-declared",
      headers: { "x-internal-secret": INTERNAL_SECRET },
    });
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: "SNAPSHOT_TABLE_NOT_DECLARED" } });
  });

  it("returns rows across every tenant, not scoped to one — this is the resync path, not a user request", async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    await runWithContext({ tenantId: tenantA }, () => db.insert(widgetsTable, { name: "A-widget" }));
    await runWithContext({ tenantId: tenantB }, () => db.insert(widgetsTable, { name: "B-widget" }));

    const response = await app.inject({
      method: "GET",
      url: "/internal/snapshot/widgets",
      headers: { "x-internal-secret": INTERNAL_SECRET },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { rows: Widget[]; next_cursor: string | null };
    const names = body.rows.map((row) => row.name);
    expect(names).toContain("A-widget");
    expect(names).toContain("B-widget");
  });

  it("paginates by cursor, advancing next_cursor until exhausted", async () => {
    const tenantId = randomUUID();
    await runWithContext({ tenantId }, () => db.insertMany(widgetsTable, [{ name: "P1" }, { name: "P2" }, { name: "P3" }]));

    const firstPage = await app.inject({
      method: "GET",
      url: "/internal/snapshot/widgets?limit=1",
      headers: { "x-internal-secret": INTERNAL_SECRET },
    });
    const firstBody = JSON.parse(firstPage.body) as { rows: Widget[]; next_cursor: string | null };
    expect(firstBody.rows).toHaveLength(1);
    expect(firstBody.next_cursor).not.toBeNull();

    const secondPage = await app.inject({
      method: "GET",
      url: `/internal/snapshot/widgets?limit=1&cursor=${firstBody.next_cursor}`,
      headers: { "x-internal-secret": INTERNAL_SECRET },
    });
    const secondBody = JSON.parse(secondPage.body) as { rows: Widget[]; next_cursor: string | null };
    expect(secondBody.rows).toHaveLength(1);
    expect(secondBody.rows[0]?.id).not.toBe(firstBody.rows[0]?.id);
  });
});
