import { ErrorCode } from "./error-code.mjs";

export type ErrorParams = Record<string, string | number | boolean>;

// The HTTP status a code maps to by default when the thrower doesn't set one
// explicitly. Lives next to the codes so the meaning of a code and its
// status can't drift apart.
const DEFAULT_HTTP_STATUS: Partial<Record<ErrorCode, number>> = {
  [ErrorCode.DB_UNIQUE_VIOLATION]: 409,
  [ErrorCode.DB_FOREIGN_KEY_VIOLATION]: 409,
  [ErrorCode.DB_NOT_NULL_VIOLATION]: 400,
  [ErrorCode.DB_QUERY_FAILED]: 500,
  [ErrorCode.DB_TENANT_CONTEXT_MISSING]: 500,
  [ErrorCode.AUTH_UNAUTHENTICATED]: 401,
  [ErrorCode.AUTH_FORBIDDEN]: 403,
  [ErrorCode.VALIDATION_FAILED]: 400,
  [ErrorCode.INTERNAL_ROUTE_FORBIDDEN]: 401,
  [ErrorCode.SNAPSHOT_TABLE_NOT_DECLARED]: 404,
  [ErrorCode.INTERNAL_ERROR]: 500,
  // All three are programmer errors in the producing service, not something
  // a caller can react to — 500 by default like INTERNAL_ERROR.
  [ErrorCode.EVENT_PUBLISH_OUTSIDE_TRANSACTION]: 500,
  [ErrorCode.EVENT_SCHEMA_INVALID]: 500,
  [ErrorCode.EVENT_NOT_DECLARED]: 500,
};

// Wire shape is { code, params, request_id } (request_id is attached at the
// HTTP layer, not here) — message is English and log-only, never serialized
// into the HTTP response. See BRIEF.md "Грешки".
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly params: ErrorParams;
  readonly httpStatus: number;

  constructor(
    code: ErrorCode,
    params: ErrorParams = {},
    options?: { cause?: unknown; httpStatus?: number },
  ) {
    super(`${code} ${JSON.stringify(params)}`, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.params = params;
    this.httpStatus = options?.httpStatus ?? DEFAULT_HTTP_STATUS[code] ?? 500;
  }
}
