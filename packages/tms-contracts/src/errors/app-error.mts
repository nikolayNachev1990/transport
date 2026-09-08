import type { ErrorCode } from "./error-code.mjs";

export type ErrorParams = Record<string, string | number | boolean>;

// Wire shape is { code, params, request_id } (request_id is attached at the
// HTTP layer, not here) — message is English and log-only, never serialized
// into the HTTP response. See BRIEF.md "Грешки".
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly params: ErrorParams;

  constructor(code: ErrorCode, params: ErrorParams = {}, options?: { cause?: unknown }) {
    super(`${code} ${JSON.stringify(params)}`, options);
    this.name = "AppError";
    this.code = code;
    this.params = params;
  }
}
