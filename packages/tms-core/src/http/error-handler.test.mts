import { describe, expect, it, vi } from "vitest";
import fastify from "fastify";
import { AppError, ErrorCode } from "tms-contracts";
import { createLogger } from "../logger/index.mjs";
import { createErrorHandler } from "./error-handler.mjs";

function buildApp(logger: ReturnType<typeof createLogger>) {
  const app = fastify();
  app.setErrorHandler(createErrorHandler(logger));
  // Normally registerController assigns request.requestId (see
  // register-controller.test.mts) — reproduced minimally here so this file
  // stays focused on error-handler.mts alone.
  app.addHook("preHandler", (request, _reply, done) => {
    request.requestId = (request.headers["x-request-id"] as string | undefined) ?? "unknown";
    done();
  });
  app.get("/boom-app-error", async () => {
    throw new AppError(ErrorCode.DB_UNIQUE_VIOLATION, { table: "orders" });
  });
  app.get("/boom-generic", async () => {
    throw new Error("something exploded, with a stack trace nobody should see");
  });
  return app;
}

describe("createErrorHandler", () => {
  it("maps AppError to its httpStatus and { code, params, request_id }, nothing else", async () => {
    const logger = createLogger("test", { destination: { write(): void {} } });
    const app = buildApp(logger);

    const response = await app.inject({ method: "GET", url: "/boom-app-error" });

    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body).toEqual({
      error: {
        code: "DB_UNIQUE_VIOLATION",
        params: { table: "orders" },
        request_id: "unknown",
      },
    });
  });

  it("maps an unrecognized error to 500 INTERNAL_ERROR with no stack trace or message in the body", async () => {
    const logger = createLogger("test", { destination: { write(): void {} } });
    const app = buildApp(logger);

    const response = await app.inject({ method: "GET", url: "/boom-generic" });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body).toEqual({ error: { code: "INTERNAL_ERROR", params: {}, request_id: "unknown" } });
    expect(response.body).not.toContain("stack");
    expect(response.body).not.toContain("exploded");
  });

  it("logs the full original error server-side, including request_id", async () => {
    const lines: Record<string, unknown>[] = [];
    const logger = createLogger("test", {
      destination: { write: (chunk: string) => lines.push(JSON.parse(chunk) as Record<string, unknown>) },
    });
    const app = buildApp(logger);

    await app.inject({ method: "GET", url: "/boom-generic", headers: { "x-request-id": "req-123" } });

    const logged = lines.find((line) => line["msg"] === "unhandled error in request handler");
    expect(logged).toBeDefined();
    expect((logged?.["err"] as { message?: string } | undefined)?.message).toContain("exploded");
    expect(logged?.["request_id"]).toBe("req-123");
  });

  it("never calls the logger for an AppError (it's an expected, handled case)", async () => {
    const errorSpy = vi.fn();
    const logger = createLogger("test", { destination: { write(): void {} } });
    logger.error = errorSpy as typeof logger.error;
    const app = buildApp(logger);

    await app.inject({ method: "GET", url: "/boom-app-error" });

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
