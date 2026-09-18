import type { BrokerEvent } from "@transport/core/broker";

interface CompanyMemberCreated extends BrokerEvent {
  body: {
    user_id: string;
    company_id: string;
    company_role: string;
    is_active: boolean;
    is_creator: boolean;
    created_by: string | null;
  };
}

// Dynamic import, not a top-level one — same deadlock reasoning as
// company.created.mts. Upsert, not a blind insert — a redelivered event
// must stay idempotent; users_created_count/drivers_created_count are
// never touched here (auth-only counters, see spec rule 2).
export default async (event: CompanyMemberCreated) => {
  const { user_id, company_id, company_role, is_active, is_creator, created_by } = event.body;

  const { db } = await import("../../resources.mjs");
  await db.raw(
    `INSERT INTO company_members (user_id, company_id, company_role, is_active, is_creator, created_by)
     VALUES (:userId, :companyId, :companyRole, :isActive, :isCreator, :createdBy)
     ON CONFLICT (user_id, company_id) DO UPDATE SET
       company_role = EXCLUDED.company_role,
       is_active = EXCLUDED.is_active,
       is_creator = EXCLUDED.is_creator,
       created_by = EXCLUDED.created_by`,
    { userId: user_id, companyId: company_id, companyRole: company_role, isActive: is_active, isCreator: is_creator, createdBy: created_by },
  );

  const { clearCompanyMembershipCache } = await import("../services/companyMembership.service.mjs");
  await clearCompanyMembershipCache(user_id, company_id);
};
