import { describe, expect, it } from "vitest";
import { AppError, ErrorCode } from "tms-contracts";
import { signJwt, verifyJwt } from "./jwt.mjs";

describe("signJwt / verifyJwt", () => {
  it("round-trips a payload", () => {
    const token = signJwt({ sub: "user-1" }, { secret: "s1" });
    const payload = verifyJwt(token, { secret: "s1" }) as { sub: string };
    expect(payload.sub).toBe("user-1");
  });

  it("throws AUTH_UNAUTHENTICATED for a token signed with a different secret", () => {
    const token = signJwt({ sub: "user-1" }, { secret: "s1" });
    try {
      verifyJwt(token, { secret: "wrong-secret" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.AUTH_UNAUTHENTICATED);
    }
  });

  it("throws AUTH_UNAUTHENTICATED for garbage input", () => {
    expect(() => verifyJwt("not-a-jwt", { secret: "s1" })).toThrow(AppError);
  });

  it("throws AUTH_UNAUTHENTICATED for an expired token", () => {
    const token = signJwt({ sub: "user-1" }, { secret: "s1", expiresInSeconds: -1 });
    expect(() => verifyJwt(token, { secret: "s1" })).toThrow(AppError);
  });
});
