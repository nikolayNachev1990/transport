import { AppError, ErrorCode } from "tms-contracts";
import { getLogContext } from "../logger/context.mjs";

// tenant_id always comes from the stage-3 AsyncLocalStorage context
// (runWithContext), never as a manually-passed argument — see
// tms-core/logger. A tenantScoped table used with no context is a bug in
// the calling code, not a business error, so it throws here rather than
// silently querying without a tenant filter.
export function requireTenantId(): string {
  const { tenantId } = getLogContext();
  if (tenantId === undefined) {
    throw new AppError(ErrorCode.DB_TENANT_CONTEXT_MISSING);
  }
  return tenantId;
}
