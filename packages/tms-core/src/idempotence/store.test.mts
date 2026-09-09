import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { testRedisUrl } from "./__fixtures__/test-env.mjs";
import { createRedisIdempotencyStore } from "./store.mjs";

let redis: Redis;

beforeAll(() => {
  redis = new Redis(testRedisUrl());
});

afterAll(async () => {
  redis.disconnect();
});

function freshKey(): string {
  return `test-idempotency:${randomUUID()}`;
}

describe("requirement 1: the key is claimed atomically before any work runs", () => {
  it("a fresh key is claimed, and the record exists in Redis immediately — not written after the fact", async () => {
    const store = createRedisIdempotencyStore({ redis });
    const key = freshKey();

    const result = await store.claim(key, "hash-a");
    expect(result).toEqual({ claimed: true });

    const raw = await redis.get(key);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? "{}")).toMatchObject({ status: "in_progress", bodyHash: "hash-a" });
  });

  it("of two simultaneous claims on the same fresh key, exactly one wins — a real race, not a check-then-set", async () => {
    const store = createRedisIdempotencyStore({ redis });
    const key = freshKey();

    const [first, second] = await Promise.all([store.claim(key, "hash-a"), store.claim(key, "hash-a")]);
    const claimedCount = [first, second].filter((result) => result.claimed).length;
    expect(claimedCount).toBe(1);
  });
});

describe("requirement 2: in_progress rejects immediately, no waiting", () => {
  it("a repeat claim while still in_progress returns in_progress without delay", async () => {
    const store = createRedisIdempotencyStore({ redis });
    const key = freshKey();
    await store.claim(key, "hash-a");

    const startedAt = Date.now();
    const result = await store.claim(key, "hash-a");
    const elapsedMs = Date.now() - startedAt;

    expect(result).toEqual({ claimed: false, reason: "in_progress" });
    expect(elapsedMs).toBeLessThan(200);
  });
});

describe("requirement 3: the stored response is replayed, not just a completion marker", () => {
  it("a repeat claim after complete() reports completed with the exact stored response", async () => {
    const store = createRedisIdempotencyStore({ redis });
    const key = freshKey();
    await store.claim(key, "hash-a");
    await store.complete(key, "hash-a", { statusCode: 201, body: { orderId: "abc-123" } });

    const result = await store.claim(key, "hash-a");
    expect(result).toEqual({
      claimed: false,
      reason: "completed",
      response: { statusCode: 201, body: { orderId: "abc-123" } },
    });
  });

  it("after fail(), the same key and body can be reclaimed — a genuine retry", async () => {
    const store = createRedisIdempotencyStore({ redis });
    const key = freshKey();
    await store.claim(key, "hash-a");
    await store.fail(key, "hash-a");

    const result = await store.claim(key, "hash-a");
    expect(result).toEqual({ claimed: true });
  });
});

describe("requirement 4: same key, different body -> conflict, at every state", () => {
  it("rejects with body_mismatch while in_progress", async () => {
    const store = createRedisIdempotencyStore({ redis });
    const key = freshKey();
    await store.claim(key, "hash-a");

    const result = await store.claim(key, "hash-b");
    expect(result).toEqual({ claimed: false, reason: "body_mismatch" });
  });

  it("rejects with body_mismatch after completion", async () => {
    const store = createRedisIdempotencyStore({ redis });
    const key = freshKey();
    await store.claim(key, "hash-a");
    await store.complete(key, "hash-a", { statusCode: 200, body: { ok: true } });

    const result = await store.claim(key, "hash-b");
    expect(result).toEqual({ claimed: false, reason: "body_mismatch" });
  });

  it("rejects with body_mismatch after a failed attempt too — a different body is not a valid retry", async () => {
    const store = createRedisIdempotencyStore({ redis });
    const key = freshKey();
    await store.claim(key, "hash-a");
    await store.fail(key, "hash-a");

    const result = await store.claim(key, "hash-b");
    expect(result).toEqual({ claimed: false, reason: "body_mismatch" });
  });
});
