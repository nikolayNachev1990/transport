import { describe, expect, it } from "vitest";
import { AppError, ErrorCode } from "tms-contracts";
import { extractAuthContext } from "./auth-context.mjs";

function hasuraPayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    "https://hasura.io/jwt/claims": {
      "x-hasura-default-role": "dispatcher",
      "x-hasura-allowed-roles": ["dispatcher"],
      "x-hasura-user-id": "user-1",
      "x-hasura-tenant-id": "tenant-1",
      ...overrides,
    },
  };
}

describe("extractAuthContext", () => {
  it("extracts userId/tenantId/role from the Hasura claims shape", () => {
    const context = extractAuthContext(hasuraPayload());
    expect(context).toEqual({ userId: "user-1", tenantId: "tenant-1", role: "dispatcher" });
  });

  it("includes driverId only when present, for the driver role", () => {
    const context = extractAuthContext(hasuraPayload({ "x-hasura-driver-id": "driver-1" }));
    expect(context.driverId).toBe("driver-1");
  });

  it("omits driverId entirely for non-driver roles", () => {
    const context = extractAuthContext(hasuraPayload());
    expect(context).not.toHaveProperty("driverId");
  });

  it("throws AUTH_UNAUTHENTICATED when the hasura claims key is missing", () => {
    expect(() => extractAuthContext({ sub: "user-1" })).toThrow(AppError);
    try {
      extractAuthContext({ sub: "user-1" });
    } catch (error) {
      expect((error as AppError).code).toBe(ErrorCode.AUTH_UNAUTHENTICATED);
    }
  });

  it("throws AUTH_UNAUTHENTICATED when a required claim is missing", () => {
    const payload = hasuraPayload();
    const claims = (payload as Record<string, Record<string, unknown>>)["https://hasura.io/jwt/claims"];
    if (claims !== undefined) {
      delete claims["x-hasura-tenant-id"];
    }
    expect(() => extractAuthContext(payload)).toThrow(AppError);
  });

  it("throws AUTH_UNAUTHENTICATED for a non-object payload", () => {
    expect(() => extractAuthContext(null)).toThrow(AppError);
    expect(() => extractAuthContext("garbage")).toThrow(AppError);
  });
});
