import type { BrokerEvent } from "@transport/core/broker";

// Dynamic import, not a top-level one — same deadlock reasoning as
// company.requested.mts. Reuses updateCompany's own subscription_plan
// branch (which already calls downgradeToFit) rather than duplicating
// that logic here — an expired subscription is just a forced downgrade
// to "free", the same operation updateCompany already knows how to do.
export default async (_event: BrokerEvent) => {
  const { db } = await import("../../resources.mjs");
  const { default: CompanyService } = await import("../services/company.service.mjs");

  const expired = await db.raw<{ rows: { id: string }[] }>(
    `SELECT id FROM companies WHERE subscription_valid_until < now() AND subscription_plan IS DISTINCT FROM 'free'`,
  );

  const service = new CompanyService();
  for (const row of expired?.rows ?? []) {
    await service.updateCompany(row.id, { subscription_plan: "free" });
  }
};
