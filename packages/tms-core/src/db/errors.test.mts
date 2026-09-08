import { describe, expect, it } from "vitest";
import { AppError, ErrorCode } from "tms-contracts";
import { translatePostgresError } from "./errors.mjs";

describe("translatePostgresError", () => {
  it("maps a unique_violation (23505) to DB_UNIQUE_VIOLATION with structural params only", () => {
    const pgError = { code: "23505", table: "orders", constraint: "orders_order_no_unique", detail: "Key (order_no)=(ORD-1) already exists." };

    const result = translatePostgresError(pgError);

    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe(ErrorCode.DB_UNIQUE_VIOLATION);
    expect(result.params).toEqual({ table: "orders", constraint: "orders_order_no_unique" });
    expect(result.params).not.toHaveProperty("detail");
  });

  it("maps a foreign_key_violation (23503) to DB_FOREIGN_KEY_VIOLATION", () => {
    const pgError = { code: "23503", table: "order_stops", constraint: "order_stops_order_id_foreign" };

    const result = translatePostgresError(pgError);

    expect(result.code).toBe(ErrorCode.DB_FOREIGN_KEY_VIOLATION);
    expect(result.params).toEqual({ table: "order_stops", constraint: "order_stops_order_id_foreign" });
  });

  it("maps a not_null_violation (23502) to DB_NOT_NULL_VIOLATION including the column", () => {
    const pgError = { code: "23502", table: "invoices", column: "client_id" };

    const result = translatePostgresError(pgError);

    expect(result.code).toBe(ErrorCode.DB_NOT_NULL_VIOLATION);
    expect(result.params).toEqual({ table: "invoices", column: "client_id" });
  });

  it("falls back to DB_QUERY_FAILED for an unrecognized Postgres error code, without leaking it raw", () => {
    const pgError = { code: "40001", message: "could not serialize access due to concurrent update" };

    const result = translatePostgresError(pgError);

    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe(ErrorCode.DB_QUERY_FAILED);
    expect(result.params).toEqual({});
  });

  it("falls back to DB_QUERY_FAILED for a completely unrelated thrown value", () => {
    const result = translatePostgresError(new Error("connection reset"));
    expect(result.code).toBe(ErrorCode.DB_QUERY_FAILED);
  });

  it("passes an existing AppError through unchanged instead of re-wrapping it", () => {
    const original = new AppError(ErrorCode.DB_TENANT_CONTEXT_MISSING);
    expect(translatePostgresError(original)).toBe(original);
  });
});
