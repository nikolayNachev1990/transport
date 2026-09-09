import type { Redis } from "ioredis";
import type { IdempotencyClaimResult, IdempotencyStoredResponse, IdempotencyStore } from "../http/types.mjs";

// One EVAL, atomic in Redis (no other client's command can interleave
// mid-script) — this is what makes the claim itself a true SET-before-work,
// not a check-then-set race. A key that doesn't exist, or whose stored
// status is "failed" with a matching body hash, gets claimed; anything
// else reports why it couldn't be.
const CLAIM_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if not existing then
  redis.call('SET', KEYS[1], cjson.encode({status = "in_progress", bodyHash = ARGV[1]}), 'PX', ARGV[2])
  return cjson.encode({claimed = true})
end

local decoded = cjson.decode(existing)
if decoded.bodyHash ~= ARGV[1] then
  return cjson.encode({claimed = false, reason = "body_mismatch"})
end

if decoded.status == "in_progress" then
  return cjson.encode({claimed = false, reason = "in_progress"})
end

if decoded.status == "completed" then
  return cjson.encode({claimed = false, reason = "completed", response = decoded.response})
end

redis.call('SET', KEYS[1], cjson.encode({status = "in_progress", bodyHash = ARGV[1]}), 'PX', ARGV[2])
return cjson.encode({claimed = true})
`;

interface ClaimScriptResult {
  claimed: boolean;
  reason?: "body_mismatch" | "in_progress" | "completed";
  response?: IdempotencyStoredResponse;
}

export interface CreateRedisIdempotencyStoreOptions {
  redis: Redis;
  ttlMs?: number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function createRedisIdempotencyStore(options: CreateRedisIdempotencyStoreOptions): IdempotencyStore {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  return {
    async claim(key: string, bodyHash: string): Promise<IdempotencyClaimResult> {
      const raw = await options.redis.eval(CLAIM_SCRIPT, 1, key, bodyHash, ttlMs);
      const result = JSON.parse(raw as string) as ClaimScriptResult;

      if (result.claimed) {
        return { claimed: true };
      }
      if (result.reason === "completed") {
        if (result.response === undefined) {
          throw new Error("idempotency store: completed record missing its response");
        }
        return { claimed: false, reason: "completed", response: result.response };
      }
      return { claimed: false, reason: result.reason ?? "in_progress" };
    },

    async complete(key: string, bodyHash: string, response: IdempotencyStoredResponse): Promise<void> {
      await options.redis.set(key, JSON.stringify({ status: "completed", bodyHash, response }), "PX", ttlMs);
    },

    async fail(key: string, bodyHash: string): Promise<void> {
      await options.redis.set(key, JSON.stringify({ status: "failed", bodyHash }), "PX", ttlMs);
    },
  };
}
