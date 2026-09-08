import { describe, expect, it } from "vitest";
import { AppError } from "./app-error.mjs";
import { ErrorCode } from "./error-code.mjs";

describe("AppError", () => {
  it("exposes code and params for the wire contract", () => {
    const error = new AppError(ErrorCode.DB_UNIQUE_VIOLATION, { table: "orders", constraint: "orders_pkey" });

    expect(error.code).toBe("DB_UNIQUE_VIOLATION");
    expect(error.params).toEqual({ table: "orders", constraint: "orders_pkey" });
  });

  it("defaults params to an empty object", () => {
    const error = new AppError(ErrorCode.DB_TENANT_CONTEXT_MISSING);
    expect(error.params).toEqual({});
  });

  it("keeps the message English and log-only, never used as the wire message", () => {
    const error = new AppError(ErrorCode.DB_UNIQUE_VIOLATION, { table: "orders" });
    expect(error.message).toContain("DB_UNIQUE_VIOLATION");
    expect([...error.message].every((char) => char.charCodeAt(0) <= 127)).toBe(true);
  });

  it("defaults httpStatus per code", () => {
    expect(new AppError(ErrorCode.DB_UNIQUE_VIOLATION).httpStatus).toBe(409);
    expect(new AppError(ErrorCode.AUTH_FORBIDDEN).httpStatus).toBe(403);
    expect(new AppError(ErrorCode.AUTH_UNAUTHENTICATED).httpStatus).toBe(401);
    expect(new AppError(ErrorCode.INTERNAL_ERROR).httpStatus).toBe(500);
  });

  it("lets the thrower override httpStatus explicitly", () => {
    const error = new AppError(ErrorCode.VALIDATION_FAILED, {}, { httpStatus: 422 });
    expect(error.httpStatus).toBe(422);
  });
});
