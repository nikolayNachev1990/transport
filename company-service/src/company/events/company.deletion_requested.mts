import type { BrokerEvent } from "@transport/core/broker";

interface CompanyDeletionRequested extends BrokerEvent {
  body: {
    id: string;
  };
}

// Published by auth-service when a company's creator deletes their own
// global account — the whole company goes with them. Dynamic import, not
// a top-level one — same deadlock reasoning as company.requested.mts.
export default async (event: CompanyDeletionRequested) => {
  const { default: CompanyService } = await import("../services/company.service.mjs");
  const service = new CompanyService();
  await service.deleteCascade(event.body.id);
};
