import { describe, expect, it, vi } from "vitest";
import fastify, { type FastifyInstance } from "fastify";
import { createLogger } from "../logger/index.mjs";
import { getLogContext } from "../logger/context.mjs";
import { createErrorHandler } from "./error-handler.mjs";
import { registerController } from "./register-controller.mjs";
import { signJwt } from "./jwt.mjs";
import type { RestController } from "./types.mjs";

const JWT_SECRET = "test-secret";
const silentLogger = createLogger("test", { destination: { write(): void {} } });

function tokenFor(tenantId: string, role = "owner", userId = "user-1"): string {
  return signJwt(
    {
      "https://hasura.io/jwt/claims": {
        "x-hasura-default-role": role,
        "x-hasura-allowed-roles": [role],
        "x-hasura-user-id": userId,
        "x-hasura-tenant-id": tenantId,
      },
    },
    { secret: JWT_SECRET },
  );
}

function buildApp(): FastifyInstance {
  const app = fastify();
  app.setErrorHandler(createErrorHandler(silentLogger));
  return app;
}

describe("registerController — requirement 1: fail fast at registration", () => {
  it("throws when a controller has no response schema", () => {
    const app = buildApp();
    const controller = {
      route: "/x",
      method: "GET",
      auth: false,
      schema: {},
      handler: async () => ({}),
    } as unknown as RestController;

    expect(() => registerController(app, controller, { jwtSecret: JWT_SECRET })).toThrow(/no response schema/);
  });

  it("throws when a controller has no auth field at all", () => {
    const app = buildApp();
    const controller = {
      route: "/x",
      method: "GET",
      schema: { response: { 200: { type: "object", additionalProperties: true } } },
      handler: async () => ({}),
    } as unknown as RestController;

    expect(() => registerController(app, controller, { jwtSecret: JWT_SECRET })).toThrow(/no auth field/);
  });

  it("registers fine when auth is explicitly false (public)", () => {
    const app = buildApp();
    const controller: RestController = {
      route: "/public",
      method: "GET",
      auth: false,
      schema: { response: { 200: { type: "object", additionalProperties: true } } },
      handler: async () => ({}),
    };

    expect(() => registerController(app, controller, { jwtSecret: JWT_SECRET })).not.toThrow();
  });
});

describe("registerController — requirement 3: roles checked by the framework, not the handler", () => {
  it("rejects a role not in auth.roles with 403, before the handler runs", async () => {
    const app = buildApp();
    const handler = vi.fn(async () => ({ ok: true }));
    registerController(
      app,
      {
        route: "/orders",
        method: "GET",
        auth: { roles: ["owner", "accountant"] },
        schema: { response: { 200: { type: "object", additionalProperties: true } } },
        handler,
      },
      { jwtSecret: JWT_SECRET },
    );

    const response = await app.inject({
      method: "GET",
      url: "/orders",
      headers: { authorization: `Bearer ${tokenFor("tenant-a", "dispatcher")}` },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({ error: { code: "AUTH_FORBIDDEN" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows a role that is in auth.roles", async () => {
    const app = buildApp();
    registerController(
      app,
      {
        route: "/orders",
        method: "GET",
        auth: { roles: ["owner"] },
        schema: { response: { 200: { type: "object", additionalProperties: true } } },
        handler: async () => ({ ok: true }),
      },
      { jwtSecret: JWT_SECRET },
    );

    const response = await app.inject({
      method: "GET",
      url: "/orders",
      headers: { authorization: `Bearer ${tokenFor("tenant-a", "owner")}` },
    });

    expect(response.statusCode).toBe(200);
  });

  it("rejects a missing or malformed Authorization header with 401", async () => {
    const app = buildApp();
    registerController(
      app,
      {
        route: "/orders",
        method: "GET",
        auth: { roles: ["owner"] },
        schema: { response: { 200: { type: "object", additionalProperties: true } } },
        handler: async () => ({ ok: true }),
      },
      { jwtSecret: JWT_SECRET },
    );

    const response = await app.inject({ method: "GET", url: "/orders" });
    expect(response.statusCode).toBe(401);
  });
});

describe("registerController — requirement 2: request context in the stage-3 ALS", () => {
  it("makes request_id/tenant_id/user_id/role visible to getLogContext() inside the handler", async () => {
    const app = buildApp();
    registerController(
      app,
      {
        route: "/whoami",
        method: "GET",
        auth: { roles: ["owner"] },
        schema: { response: { 200: { type: "object", additionalProperties: true } } },
        handler: async () => getLogContext(),
      },
      { jwtSecret: JWT_SECRET },
    );

    const response = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { authorization: `Bearer ${tokenFor("tenant-a", "owner", "user-a")}` },
    });

    const body = JSON.parse(response.body) as { tenantId: string; userId: string; role: string };
    expect(body.tenantId).toBe("tenant-a");
    expect(body.userId).toBe("user-a");
    expect(body.role).toBe("owner");
  });

  it("keeps two concurrent requests from different tenants isolated — no cross-talk", async () => {
    const app = buildApp();
    registerController(
      app,
      {
        route: "/whoami-slow",
        method: "GET",
        auth: { roles: ["owner"] },
        schema: { response: { 200: { type: "object", additionalProperties: true } } },
        handler: async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return getLogContext();
        },
      },
      { jwtSecret: JWT_SECRET },
    );

    const [responseA, responseB] = await Promise.all([
      app.inject({
        method: "GET",
        url: "/whoami-slow",
        headers: { authorization: `Bearer ${tokenFor("tenant-a", "owner")}` },
      }),
      app.inject({
        method: "GET",
        url: "/whoami-slow",
        headers: { authorization: `Bearer ${tokenFor("tenant-b", "owner")}` },
      }),
    ]);

    const bodyA = JSON.parse(responseA.body) as { tenantId: string };
    const bodyB = JSON.parse(responseB.body) as { tenantId: string };
    expect(bodyA.tenantId).toBe("tenant-a");
    expect(bodyB.tenantId).toBe("tenant-b");
  });

  it("does not carry any tenant context for a public (auth: false) route", async () => {
    const app = buildApp();
    registerController(
      app,
      {
        route: "/public-whoami",
        method: "GET",
        auth: false,
        schema: { response: { 200: { type: "object", additionalProperties: true } } },
        handler: async () => getLogContext(),
      },
      { jwtSecret: JWT_SECRET },
    );

    const response = await app.inject({ method: "GET", url: "/public-whoami" });
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(body["tenantId"]).toBeUndefined();
    expect(body["requestId"]).toBeDefined();
  });
});

describe("registerController — middlewares slot (requirement 6, idempotency interface)", () => {
  it("runs middlewares in order and skips the handler once one sends a reply", async () => {
    const app = buildApp();
    const handler = vi.fn(async () => ({ fresh: true }));

    registerController(
      app,
      {
        route: "/idempotent",
        method: "POST",
        auth: false,
        schema: { response: { 200: { type: "object", additionalProperties: true } } },
        middlewares: [
          async (_request, reply) => {
            await reply.status(200).send({ cached: true });
          },
        ],
        handler,
      },
      { jwtSecret: JWT_SECRET },
    );

    const response = await app.inject({ method: "POST", url: "/idempotent" });

    expect(JSON.parse(response.body)).toEqual({ cached: true });
    expect(handler).not.toHaveBeenCalled();
  });
});
