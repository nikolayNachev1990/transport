import { db, cache } from "../../resources.mjs";
import companyMembershipConfig from "../../config/companyMembership.mjs";

interface CompanyMemberRow {
  company_role: string;
}

interface CachedMembership {
  company_role: string | null; // null cached = checked, caller is not an active member
}

function cacheKey(userId: string, companyId: string): string {
  return `${companyMembershipConfig.cachePrefix}${userId}:${companyId}`;
}

// Resolves the caller's role within one specific company, for the hasura
// webhook's X-Hasura-Role/X-Hasura-Company-Id — this runs on every
// company-scoped Hasura request (not just on login), so both the found
// and not-found outcome are cached for 30s to keep it off the hot path.
export async function resolveCompanyRole(userId: string, companyId: string): Promise<string | null> {
  const key = cacheKey(userId, companyId);
  const cached = await cache.getValue(key);
  if (cached !== null) {
    return (JSON.parse(cached) as CachedMembership).company_role;
  }

  const row = (await db.findByWhere<CompanyMemberRow>("company_members", {
    user_id: userId,
    company_id: companyId,
    is_active: true,
    deleted_at: null,
  })) as CompanyMemberRow | null;
  const companyRole = row ? row.company_role : null;

  await cache.setValue(key, JSON.stringify({ company_role: companyRole } satisfies CachedMembership), companyMembershipConfig.cacheTtlSeconds);
  return companyRole;
}

// Called by every future mutation that changes membership/role/activity/
// deletion (Etap 4 onward, per spec rule 2/12) — without this, a stale
// cached role or denial could outlive the change for up to 30 seconds.
export async function clearCompanyMembershipCache(userId: string, companyId: string): Promise<void> {
  await cache.deleteValue(cacheKey(userId, companyId));
}
