import { describe, expect, it } from "vitest";
import { createDb } from "../db/db.mjs";
import { defineTable, type TenantScopedRow } from "../db/table.mjs";
import { createLogger } from "../logger/index.mjs";
import { createHttpApp, registerControllers } from "./app.mjs";
import type { RestController } from "./types.mjs";

interface Widget extends TenantScopedRow {
  name: string;
}

const silentLogger = createLogger("test-service", { destination: { write(): void {} } });

describe("createHttpApp — requirement 6: body limit", () => {
  it("rejects a request body larger than the configured limit", async () => {
    const app = await createHttpApp({ serviceName: "test", jwtSecret: "s", logger: silentLogger, bodyLimitBytes: 16 });
    const controller: RestController = {
      route: "/echo",
      method: "POST",
      auth: false,
      schema: { response: { 200: { type: "object" } } },
      handler: async (request) => request.body as object,
    };
    registerControllers(app, [controller], { jwtSecret: "s" });

    const response = await app.inject({
      method: "POST",
      url: "/echo",
      payload: { text: "this payload is definitely longer than sixteen bytes" },
    });

    expect(response.statusCode).toBe(413);
  });
});

describe("createHttpApp — requirement 5: /internal/* hidden from Swagger", () => {
  it("excludes /internal/snapshot/:table from the generated OpenAPI document, but keeps public routes", async () => {
    const db = createDb({ connectionString: "postgres://unused-in-this-test/db" });
    const widgetsTable = defineTable<Widget>("test_widgets", { tenantScoped: true });

    const app = await createHttpApp({
      serviceName: "test",
      jwtSecret: "s",
      logger: silentLogger,
      internal: { secret: "internal-secret", db, snapshotTables: { widgets: widgetsTable } },
    });
    registerControllers(
      app,
      [
        {
          route: "/orders",
          method: "GET",
          auth: false,
          schema: { response: { 200: { type: "object" } } },
          handler: async () => ({}),
        },
      ],
      { jwtSecret: "s" },
    );
    await app.ready();

    const spec = app.swagger() as { paths: Record<string, unknown> };
    expect(spec.paths["/orders"]).toBeDefined();
    expect(spec.paths["/internal/snapshot/{table}"]).toBeUndefined();

    await db.destroy();
  });
});

describe("createHttpApp — error handling is wired end to end", () => {
  it("uses the AppError-aware error handler by default", async () => {
    const app = await createHttpApp({ serviceName: "test", jwtSecret: "s", logger: silentLogger });
    registerControllers(
      app,
      [
        {
          route: "/orders/:id",
          method: "GET",
          auth: false,
          schema: {
            params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
            response: { 200: { type: "object" } },
          },
          handler: async () => {
            throw new Error("boom");
          },
        },
      ],
      { jwtSecret: "s" },
    );

    const response = await app.inject({ method: "GET", url: "/orders/1" });
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
  });
});
