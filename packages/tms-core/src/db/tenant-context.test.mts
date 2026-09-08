import { describe, expect, it } from "vitest";
import { AppError, ErrorCode } from "tms-contracts";
import { runWithContext } from "../logger/context.mjs";
import { requireTenantId } from "./tenant-context.mjs";

describe("requireTenantId", () => {
  it("returns tenant_id from the stage-3 logging context", () => {
    runWithContext({ tenantId: "tenant-a" }, () => {
      expect(requireTenantId()).toBe("tenant-a");
    });
  });

  it("throws DB_TENANT_CONTEXT_MISSING when called outside any context", () => {
    expect(() => requireTenantId()).toThrow(AppError);
    try {
      requireTenantId();
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.DB_TENANT_CONTEXT_MISSING);
    }
  });

  it("throws when the context exists but carries no tenantId", () => {
    runWithContext({ requestId: "r1" }, () => {
      expect(() => requireTenantId()).toThrow(AppError);
    });
  });
});
