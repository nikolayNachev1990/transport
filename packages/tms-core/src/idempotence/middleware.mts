import { AppError, ErrorCode } from "tms-contracts";
import type { Middleware, IdempotencyStore } from "../http/types.mjs";
import { getLogContext } from "../logger/context.mjs";
import { hashRequestBody } from "./hash.mjs";

export type RedisFailurePolicy = "fail-open" | "fail-closed";

export interface CreateIdempotencyMiddlewareOptions {
  store: IdempotencyStore;
  // Stable identifier for this endpoint — the route pattern
  // (request.routeOptions.url), not the resolved URL with real param
  // values. Part of the key scope alongside tenant_id (requirement 5).
  endpointName: string;
  // Money endpoints: fail-closed (refuse rather than risk a duplicate).
  // Low-stakes endpoints (a file upload): fail-open (proceed unprotected
  // rather than take the whole feature down over a Redis hiccup).
  onRedisUnavailable: RedisFailurePolicy;
  headerName?: string;
}

const DEFAULT_HEADER = "idempotency-key";

export function createIdempotencyMiddleware(options: CreateIdempotencyMiddlewareOptions): Middleware {
  const headerName = options.headerName ?? DEFAULT_HEADER;

  return async (request, reply) => {
    const idempotencyKeyHeader = request.headers[headerName];
    const idempotencyKey = Array.isArray(idempotencyKeyHeader) ? idempotencyKeyHeader[0] : idempotencyKeyHeader;
    if (idempotencyKey === undefined || idempotencyKey.length === 0) {
      return; // opt-in: no key header, no idempotency protection
    }

    const tenantId = getLogContext().tenantId;
    if (tenantId === undefined) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, { reason: "idempotency middleware ran with no tenant context" });
    }

    const scopeKey = `idempotency:${tenantId}:${options.endpointName}:${idempotencyKey}`;
    const bodyHash = hashRequestBody(request.body);

    const claimResult = await options.store.claim(scopeKey, bodyHash).catch((redisError: unknown) => {
      if (options.onRedisUnavailable === "fail-closed") {
        throw new AppError(ErrorCode.IDEMPOTENCY_STORE_UNAVAILABLE, {}, { cause: redisError });
      }
      return undefined; // fail-open sentinel
    });

    if (claimResult === undefined) {
      return; // fail-open: Redis is down, proceed without protection
    }

    if (!claimResult.claimed) {
      if (claimResult.reason === "body_mismatch") {
        throw new AppError(ErrorCode.IDEMPOTENCY_BODY_MISMATCH);
      }
      if (claimResult.reason === "in_progress") {
        throw new AppError(ErrorCode.IDEMPOTENCY_IN_PROGRESS);
      }
      await reply.status(claimResult.response.statusCode).send(claimResult.response.body);
      return;
    }

    // Claimed: wrap reply.send so the eventual outcome — success or a
    // thrown error, since our http error handler also ends in
    // reply.send() on this same reply — gets recorded exactly once,
    // without the handler needing to know idempotency is involved.
    const originalSend = reply.send.bind(reply);
    let finalized = false;
    reply.send = ((payload?: unknown) => {
      if (finalized) {
        return originalSend(payload);
      }
      finalized = true;
      const statusCode = reply.statusCode;
      const record =
        statusCode < 500
          ? options.store.complete(scopeKey, bodyHash, { statusCode, body: payload })
          : options.store.fail(scopeKey, bodyHash);
      return record
        .catch(() => {
          // Recording failure must never break the response itself — the
          // worst case is a stuck in_progress key until its TTL expires.
        })
        .then(() => originalSend(payload));
    }) as typeof reply.send;
  };
}
