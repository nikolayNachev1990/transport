import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Redis } from "ioredis";
import fastify, { type FastifyInstance } from "fastify";
import { createErrorHandler, registerController, signJwt } from "../http/index.mjs";
import { createLogger } from "../logger/index.mjs";
import type { RestController } from "../http/types.mjs";
import { testRedisUrl } from "./__fixtures__/test-env.mjs";
import { createRedisIdempotencyStore } from "./store.mjs";
import { createIdempotencyMiddleware } from "./middleware.mjs";

const REDIS_CONTAINER = "tms-core-redis-1";
const JWT_SECRET = "test-secret";

function tokenFor(tenantId: string): string {
  return signJwt(
    {
      "https://hasura.io/jwt/claims": {
        "x-hasura-default-role": "owner",
        "x-hasura-allowed-roles": ["owner"],
        "x-hasura-user-id": "user-1",
        "x-hasura-tenant-id": tenantId,
      },
    },
    { secret: JWT_SECRET },
  );
}

let redis: Redis;

beforeAll(() => {
  redis = new Redis(testRedisUrl());
});

afterAll(() => {
  redis.disconnect();
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildApp(): { app: FastifyInstance; handler: ReturnType<typeof vi.fn> } {
  const app = fastify();
  app.setErrorHandler(createErrorHandler(createLogger("test", { destination: { write(): void {} } })));
  const store = createRedisIdempotencyStore({ redis });
  const handler = vi.fn(async (request: { body: unknown }) => ({ echoed: request.body }));

  const controller: RestController = {
    route: "/orders",
    method: "POST",
    auth: { roles: ["owner"] },
    schema: { response: { 201: { type: "object", additionalProperties: true } } },
    middlewares: [
      createIdempotencyMiddleware({ store, endpointName: "POST /orders", onRedisUnavailable: "fail-closed" }),
    ],
    handler: async (request, reply) => {
      const result = await handler(request as { body: unknown });
      await reply.status(201).send(result);
    },
  };
  registerController(app, controller, { jwtSecret: JWT_SECRET });

  return { app, handler };
}

describe("requirement 3: the repeat returns the same stored body, not an empty 200", () => {
  it("a repeat request with the same key and body replays the exact first response without re-running the handler", async () => {
    const { app, handler } = buildApp();
    const tenantId = randomUUID();
    const headers = { authorization: `Bearer ${tokenFor(tenantId)}`, "idempotency-key": randomUUID() };
    const payload = { order_no: "ORD-1" };

    const first = await app.inject({ method: "POST", url: "/orders", headers, payload });
    expect(first.statusCode).toBe(201);
    expect(handler).toHaveBeenCalledTimes(1);

    const second = await app.inject({ method: "POST", url: "/orders", headers, payload });
    expect(second.statusCode).toBe(201);
    expect(JSON.parse(second.body)).toEqual(JSON.parse(first.body));
    expect(handler).toHaveBeenCalledTimes(1); // still 1 — not re-run
  });

  it("a request with no Idempotency-Key header is never deduplicated", async () => {
    const { app, handler } = buildApp();
    const tenantId = randomUUID();
    const headers = { authorization: `Bearer ${tokenFor(tenantId)}` };
    const payload = { order_no: "ORD-1" };

    await app.inject({ method: "POST", url: "/orders", headers, payload });
    await app.inject({ method: "POST", url: "/orders", headers, payload });

    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe("requirement 2: a concurrent repeat while in_progress gets 409, without waiting", () => {
  it("rejects a request that arrives while the first is still running", async () => {
    const app = fastify();
    app.setErrorHandler(createErrorHandler(createLogger("test", { destination: { write(): void {} } })));
    const store = createRedisIdempotencyStore({ redis });
    const tenantId = randomUUID();
    const idempotencyKey = randomUUID();

    const controller: RestController = {
      route: "/slow-orders",
      method: "POST",
      auth: { roles: ["owner"] },
      schema: { response: { 201: { type: "object", additionalProperties: true } } },
      middlewares: [
        createIdempotencyMiddleware({ store, endpointName: "POST /slow-orders", onRedisUnavailable: "fail-closed" }),
      ],
      handler: async (_request, reply) => {
        await delay(300);
        await reply.status(201).send({ done: true });
      },
    };
    registerController(app, controller, { jwtSecret: JWT_SECRET });

    const headers = { authorization: `Bearer ${tokenFor(tenantId)}`, "idempotency-key": idempotencyKey };
    const firstPromise = app.inject({ method: "POST", url: "/slow-orders", headers, payload: {} });
    await delay(50); // let the first request actually claim the key first

    const startedAt = Date.now();
    const second = await app.inject({ method: "POST", url: "/slow-orders", headers, payload: {} });
    const elapsedMs = Date.now() - startedAt;

    expect(second.statusCode).toBe(409);
    expect(JSON.parse(second.body)).toMatchObject({ error: { code: "IDEMPOTENCY_IN_PROGRESS" } });
    expect(elapsedMs).toBeLessThan(250); // rejected immediately, not made to wait for the first

    const first = await firstPromise;
    expect(first.statusCode).toBe(201);
  });
});

describe("requirement 4 (through the HTTP layer): same key, different body -> 422", () => {
  it("rejects a repeat with the same key but a different body", async () => {
    const { app } = buildApp();
    const tenantId = randomUUID();
    const key = randomUUID();

    const first = await app.inject({
      method: "POST",
      url: "/orders",
      headers: { authorization: `Bearer ${tokenFor(tenantId)}`, "idempotency-key": key },
      payload: { order_no: "ORD-1" },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/orders",
      headers: { authorization: `Bearer ${tokenFor(tenantId)}`, "idempotency-key": key },
      payload: { order_no: "ORD-2" },
    });
    expect(second.statusCode).toBe(422);
    expect(JSON.parse(second.body)).toMatchObject({ error: { code: "IDEMPOTENCY_BODY_MISMATCH" } });
  });
});

describe("requirement 5: key scope is tenant_id + endpoint + key", () => {
  it("the same Idempotency-Key from two different tenants does not collide", async () => {
    const { app, handler } = buildApp();
    const key = randomUUID();
    const payload = { order_no: "ORD-1" };

    const tenantAResponse = await app.inject({
      method: "POST",
      url: "/orders",
      headers: { authorization: `Bearer ${tokenFor(randomUUID())}`, "idempotency-key": key },
      payload,
    });
    const tenantBResponse = await app.inject({
      method: "POST",
      url: "/orders",
      headers: { authorization: `Bearer ${tokenFor(randomUUID())}`, "idempotency-key": key },
      payload,
    });

    expect(tenantAResponse.statusCode).toBe(201);
    expect(tenantBResponse.statusCode).toBe(201);
    expect(handler).toHaveBeenCalledTimes(2); // each tenant actually ran the handler
  });

  it("the same Idempotency-Key on two different endpoints does not collide", async () => {
    const app = fastify();
    app.setErrorHandler(createErrorHandler(createLogger("test", { destination: { write(): void {} } })));
    const store = createRedisIdempotencyStore({ redis });
    const handlerA = vi.fn(async () => ({ from: "a" }));
    const handlerB = vi.fn(async () => ({ from: "b" }));

    registerController(
      app,
      {
        route: "/endpoint-a",
        method: "POST",
        auth: { roles: ["owner"] },
        schema: { response: { 200: { type: "object", additionalProperties: true } } },
        middlewares: [createIdempotencyMiddleware({ store, endpointName: "POST /endpoint-a", onRedisUnavailable: "fail-closed" })],
        handler: async () => handlerA(),
      },
      { jwtSecret: JWT_SECRET },
    );
    registerController(
      app,
      {
        route: "/endpoint-b",
        method: "POST",
        auth: { roles: ["owner"] },
        schema: { response: { 200: { type: "object", additionalProperties: true } } },
        middlewares: [createIdempotencyMiddleware({ store, endpointName: "POST /endpoint-b", onRedisUnavailable: "fail-closed" })],
        handler: async () => handlerB(),
      },
      { jwtSecret: JWT_SECRET },
    );

    const tenantId = randomUUID();
    const key = randomUUID();
    const headers = { authorization: `Bearer ${tokenFor(tenantId)}`, "idempotency-key": key };

    await app.inject({ method: "POST", url: "/endpoint-a", headers, payload: {} });
    await app.inject({ method: "POST", url: "/endpoint-b", headers, payload: {} });

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
  });
});

describe("requirement 6: Redis-down behavior is configurable per endpoint", () => {
  it(
    "fail-closed refuses the request with 503 when Redis is unreachable",
    async () => {
      const app = fastify();
      app.setErrorHandler(createErrorHandler(createLogger("test", { destination: { write(): void {} } })));
      const brokenRedis = new Redis(testRedisUrl(), { maxRetriesPerRequest: 1, retryStrategy: () => null });
      const store = createRedisIdempotencyStore({ redis: brokenRedis });

      registerController(
        app,
        {
          route: "/money",
          method: "POST",
          auth: { roles: ["owner"] },
          schema: { response: { 201: { type: "object", additionalProperties: true } } },
          middlewares: [createIdempotencyMiddleware({ store, endpointName: "POST /money", onRedisUnavailable: "fail-closed" })],
          handler: async (_request, reply) => reply.status(201).send({ charged: true }),
        },
        { jwtSecret: JWT_SECRET },
      );

      execSync(`docker stop ${REDIS_CONTAINER}`, { stdio: "ignore" });
      try {
        const response = await app.inject({
          method: "POST",
          url: "/money",
          headers: { authorization: `Bearer ${tokenFor(randomUUID())}`, "idempotency-key": randomUUID() },
          payload: {},
        });
        expect(response.statusCode).toBe(503);
        expect(JSON.parse(response.body)).toMatchObject({ error: { code: "IDEMPOTENCY_STORE_UNAVAILABLE" } });
      } finally {
        brokenRedis.disconnect();
        execSync(`docker start ${REDIS_CONTAINER}`, { stdio: "ignore" });
        let recovered = false;
        for (let attempt = 0; attempt < 20 && !recovered; attempt += 1) {
          try {
            execSync(`docker exec ${REDIS_CONTAINER} redis-cli ping`, { stdio: "ignore" });
            recovered = true;
          } catch {
            await delay(500);
          }
        }
      }
    },
    30_000,
  );

  it(
    "fail-open proceeds without idempotency protection when Redis is unreachable",
    async () => {
      const app = fastify();
      app.setErrorHandler(createErrorHandler(createLogger("test", { destination: { write(): void {} } })));
      const brokenRedis = new Redis(testRedisUrl(), { maxRetriesPerRequest: 1, retryStrategy: () => null });
      const store = createRedisIdempotencyStore({ redis: brokenRedis });
      const handler = vi.fn(async () => ({ uploaded: true }));

      registerController(
        app,
        {
          route: "/uploads",
          method: "POST",
          auth: { roles: ["owner"] },
          schema: { response: { 201: { type: "object", additionalProperties: true } } },
          middlewares: [createIdempotencyMiddleware({ store, endpointName: "POST /uploads", onRedisUnavailable: "fail-open" })],
          handler: async (_request, reply) => reply.status(201).send(await handler()),
        },
        { jwtSecret: JWT_SECRET },
      );

      execSync(`docker stop ${REDIS_CONTAINER}`, { stdio: "ignore" });
      try {
        const response = await app.inject({
          method: "POST",
          url: "/uploads",
          headers: { authorization: `Bearer ${tokenFor(randomUUID())}`, "idempotency-key": randomUUID() },
          payload: {},
        });
        expect(response.statusCode).toBe(201);
        expect(handler).toHaveBeenCalledTimes(1);
      } finally {
        brokenRedis.disconnect();
        execSync(`docker start ${REDIS_CONTAINER}`, { stdio: "ignore" });
        let recovered = false;
        for (let attempt = 0; attempt < 20 && !recovered; attempt += 1) {
          try {
            execSync(`docker exec ${REDIS_CONTAINER} redis-cli ping`, { stdio: "ignore" });
            recovered = true;
          } catch {
            await delay(500);
          }
        }
      }
    },
    30_000,
  );
});
