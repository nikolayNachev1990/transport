import type { BrokerEvent } from "@transport/core/broker";

interface CompanyMemberActivated extends BrokerEvent {
  body: {
    user_id: string;
    company_id: string;
  };
}

export default async (event: CompanyMemberActivated) => {
  const { db } = await import("../../resources.mjs");
  await db.updateByWhere("company_members", { user_id: event.body.user_id, company_id: event.body.company_id }, { is_active: true });

  const { clearCompanyMembershipCache } = await import("../services/companyMembership.service.mjs");
  await clearCompanyMembershipCache(event.body.user_id, event.body.company_id);
};
