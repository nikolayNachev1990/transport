import { AppError, ErrorCode } from "tms-contracts";

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: string;
  driverId?: string;
}

const HASURA_CLAIMS_KEY = "https://hasura.io/jwt/claims";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// Deliberately hand-written, not Zod — BRIEF.md reserves Zod for env config
// only; everywhere else validation goes through JSON Schema/AJV or, for a
// shape this small and internal, a plain type guard.
export function extractAuthContext(jwtPayload: unknown): AuthContext {
  if (typeof jwtPayload !== "object" || jwtPayload === null) {
    throw new AppError(ErrorCode.AUTH_UNAUTHENTICATED);
  }

  const claims = (jwtPayload as Record<string, unknown>)[HASURA_CLAIMS_KEY];
  if (typeof claims !== "object" || claims === null) {
    throw new AppError(ErrorCode.AUTH_UNAUTHENTICATED);
  }

  const record = claims as Record<string, unknown>;
  const userId = record["x-hasura-user-id"];
  const tenantId = record["x-hasura-tenant-id"];
  const role = record["x-hasura-default-role"];
  const driverId = record["x-hasura-driver-id"];

  if (!isNonEmptyString(userId) || !isNonEmptyString(tenantId) || !isNonEmptyString(role)) {
    throw new AppError(ErrorCode.AUTH_UNAUTHENTICATED);
  }

  return {
    userId,
    tenantId,
    role,
    ...(isNonEmptyString(driverId) && { driverId }),
  };
}
