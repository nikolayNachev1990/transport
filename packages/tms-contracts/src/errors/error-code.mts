// Grows as each stage needs a new code. Never remove/renumber an existing
// entry once a service ships with it — the frontend i18n layer keys its
// translations off these strings.
export const ErrorCode = {
  DB_UNIQUE_VIOLATION: "DB_UNIQUE_VIOLATION",
  DB_FOREIGN_KEY_VIOLATION: "DB_FOREIGN_KEY_VIOLATION",
  DB_NOT_NULL_VIOLATION: "DB_NOT_NULL_VIOLATION",
  DB_QUERY_FAILED: "DB_QUERY_FAILED",
  DB_TENANT_CONTEXT_MISSING: "DB_TENANT_CONTEXT_MISSING",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
