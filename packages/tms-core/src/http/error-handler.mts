import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError, ErrorCode } from "tms-contracts";
import type { Logger } from "../logger/index.mjs";

interface ErrorResponseBody {
  error: {
    code: string;
    params: Record<string, unknown>;
    request_id: string;
  };
}

// Just the AJV error-object fields this handler actually reads — avoids
// taking a direct dependency on ajv's types for fastify's transitive one.
interface ValidationIssue {
  instancePath: string;
  params: Record<string, unknown>;
}

interface FastifyValidationError {
  validation: ValidationIssue[];
}

function hasNumberStatusCode(error: unknown): error is { statusCode: number } {
  return typeof error === "object" && error !== null && typeof (error as { statusCode?: unknown }).statusCode === "number";
}

function isFastifyValidationError(error: unknown): error is FastifyValidationError {
  return (
    typeof error === "object" &&
    error !== null &&
    "validation" in error &&
    Array.isArray((error as { validation: unknown }).validation)
  );
}

function sendError(reply: FastifyReply, requestId: string, status: number, code: string, params: Record<string, unknown> = {}): void {
  const body: ErrorResponseBody = { error: { code, params, request_id: requestId } };
  void reply.status(status).send(body);
}

// AppError -> its own httpStatus. Fastify/AJV validation errors -> 400
// VALIDATION_FAILED. Anything else -> the full error is logged server-side
// with request_id, and the client gets nothing but INTERNAL_ERROR — no
// stack trace, no raw message, ever, in the response body.
export function createErrorHandler(logger: Logger) {
  return function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
    const requestId = request.requestId ?? "unknown";

    if (error instanceof AppError) {
      sendError(reply, requestId, error.httpStatus, error.code, error.params);
      return;
    }

    if (isFastifyValidationError(error)) {
      const fields = error.validation
        .map((issue) => issue.instancePath.replace(/^\//, "") || String(issue.params["missingProperty"] ?? ""))
        .filter((field) => field.length > 0)
        .join(",");
      sendError(reply, requestId, 400, ErrorCode.VALIDATION_FAILED, { fields });
      return;
    }

    // A framework-level client error (body too large, malformed JSON,
    // method not allowed, ...) still deserves its real 4xx, not a blanket
    // 500 — that would misreport the client's mistake as our bug. Anything
    // without a 4xx statusCode falls through to the true "unexpected" case
    // below, fully logged, INTERNAL_ERROR to the client.
    const statusCode = hasNumberStatusCode(error) ? error.statusCode : undefined;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      sendError(reply, requestId, statusCode, ErrorCode.HTTP_CLIENT_ERROR);
      return;
    }

    logger.error({ err: error, request_id: requestId }, "unhandled error in request handler");
    sendError(reply, requestId, 500, ErrorCode.INTERNAL_ERROR);
  };
}
