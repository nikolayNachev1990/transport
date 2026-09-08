import { describe, expect, it } from "vitest";
import { redactSensitive, REDACTED_VALUE } from "./redact.mjs";

const CIRCULAR_VALUE = "[CIRCULAR]";

describe("redactSensitive", () => {
  it("redacts every sensitive key at the top level", () => {
    const result = redactSensitive({
      password: "hunter2",
      password_hash: "$argon2id$...",
      token: "abc.def.ghi",
      refresh_token: "rt_123",
      authorization: "Bearer abc",
      code: "482913",
      vat_number: "BG123456789",
      card_last4: "4242",
      driver_id: "d-1",
    });

    expect(result).toEqual({
      password: REDACTED_VALUE,
      password_hash: REDACTED_VALUE,
      token: REDACTED_VALUE,
      refresh_token: REDACTED_VALUE,
      authorization: REDACTED_VALUE,
      code: REDACTED_VALUE,
      vat_number: REDACTED_VALUE,
      card_last4: REDACTED_VALUE,
      driver_id: "d-1",
    });
  });

  it("redacts sensitive keys nested arbitrarily deep", () => {
    const result = redactSensitive({
      request: {
        headers: { authorization: "Bearer abc" },
        body: { user: { password: "hunter2" } },
      },
    });

    expect(result).toEqual({
      request: {
        headers: { authorization: REDACTED_VALUE },
        body: { user: { password: REDACTED_VALUE } },
      },
    });
  });

  it("redacts sensitive keys inside arrays of objects", () => {
    const result = redactSensitive({
      drivers: [{ name: "Ivan", refresh_token: "rt_1" }, { name: "Maria", refresh_token: "rt_2" }],
    });

    expect(result).toEqual({
      drivers: [
        { name: "Ivan", refresh_token: REDACTED_VALUE },
        { name: "Maria", refresh_token: REDACTED_VALUE },
      ],
    });
  });

  it("is case-insensitive on key names", () => {
    const result = redactSensitive({ Password: "hunter2", TOKEN: "abc" });
    expect(result).toEqual({ Password: REDACTED_VALUE, TOKEN: REDACTED_VALUE });
  });

  it("does not touch primitives, null, or non-sensitive fields", () => {
    expect(redactSensitive("plain string")).toBe("plain string");
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive(null)).toBe(null);
    expect(redactSensitive({ order_no: "ORD-1", status: "confirmed" })).toEqual({
      order_no: "ORD-1",
      status: "confirmed",
    });
  });

  it("does not infinite-loop on a circular reference, and does not leak through it", () => {
    const circular: Record<string, unknown> = { password: "hunter2" };
    circular.self = circular;

    const result = redactSensitive(circular) as Record<string, unknown>;
    expect(result.password).toBe(REDACTED_VALUE);
    expect(result.self).toBe(CIRCULAR_VALUE);
  });
});
