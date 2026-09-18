import type { BrokerEvent } from "@transport/core/broker";

interface CompanyMemberUpdated extends BrokerEvent {
  body: {
    user_id: string;
    company_id: string;
    company_role?: string;
    is_active?: boolean;
  };
}

const MIRRORED_FIELDS = ["company_role", "is_active"] as const;

export default async (event: CompanyMemberUpdated) => {
  const { user_id, company_id, ...rest } = event.body;
  const sets: Record<string, unknown> = {};
  for (const field of MIRRORED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rest, field)) sets[field] = rest[field];
  }
  if (Object.keys(sets).length === 0) return;

  const { db } = await import("../../resources.mjs");
  await db.updateByWhere("company_members", { user_id, company_id }, sets);

  const { clearCompanyMembershipCache } = await import("../services/companyMembership.service.mjs");
  await clearCompanyMembershipCache(user_id, company_id);
};
