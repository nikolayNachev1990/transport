// Grows as each stage needs a new code. Never remove/renumber an existing
// entry once a service ships with it — the frontend i18n layer keys its
// translations off these strings.
export const ErrorCode = {
  DB_UNIQUE_VIOLATION: "DB_UNIQUE_VIOLATION",
  DB_FOREIGN_KEY_VIOLATION: "DB_FOREIGN_KEY_VIOLATION",
  DB_NOT_NULL_VIOLATION: "DB_NOT_NULL_VIOLATION",
  DB_QUERY_FAILED: "DB_QUERY_FAILED",
  DB_TENANT_CONTEXT_MISSING: "DB_TENANT_CONTEXT_MISSING",
  AUTH_UNAUTHENTICATED: "AUTH_UNAUTHENTICATED",
  AUTH_FORBIDDEN: "AUTH_FORBIDDEN",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INTERNAL_ROUTE_FORBIDDEN: "INTERNAL_ROUTE_FORBIDDEN",
  SNAPSHOT_TABLE_NOT_DECLARED: "SNAPSHOT_TABLE_NOT_DECLARED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  // A framework-level 4xx that isn't ours to classify further (body too
  // large, malformed JSON, unsupported method, ...) — still the client's
  // fault, so it must not present as INTERNAL_ERROR/500.
  HTTP_CLIENT_ERROR: "HTTP_CLIENT_ERROR",
  // publish() called with no active tms-core/db transaction — the outbox
  // row would commit independently of whatever business row it's meant to
  // accompany, defeating the whole point of the outbox pattern.
  EVENT_PUBLISH_OUTSIDE_TRANSACTION: "EVENT_PUBLISH_OUTSIDE_TRANSACTION",
  EVENT_SCHEMA_INVALID: "EVENT_SCHEMA_INVALID",
  EVENT_NOT_DECLARED: "EVENT_NOT_DECLARED",
  // A repeat request while the original is still running — refused
  // immediately, never made to wait for the original to finish.
  IDEMPOTENCY_IN_PROGRESS: "IDEMPOTENCY_IN_PROGRESS",
  // Same Idempotency-Key, different request body.
  IDEMPOTENCY_BODY_MISMATCH: "IDEMPOTENCY_BODY_MISMATCH",
  // The idempotency store (Redis) is unreachable and this endpoint is
  // configured fail-closed — refuse rather than risk a duplicate.
  IDEMPOTENCY_STORE_UNAVAILABLE: "IDEMPOTENCY_STORE_UNAVAILABLE",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
