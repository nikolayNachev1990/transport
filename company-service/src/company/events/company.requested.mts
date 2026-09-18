import type { BrokerEvent } from "@transport/core/broker";

interface CompanyRequested extends BrokerEvent {
  body: {
    eik: string;
    country: string;
    name: string;
    source: string;
  };
}

// Dynamic import, not a top-level one — this file is itself imported by
// config/broker.mts's consumer scan, which resources.mjs's own broker
// creation runs during its top-level await; a top-level import of
// resources.mjs here would deadlock (see upload-service's
// uploads.clear.queue.mts for the same pattern).
//
// Published by billing/order when they recognize an eik they don't have
// a company_id for yet (see the async company-creation addendum to this
// service's spec) — never a synchronous call. findOrCreateFromRequest
// always publishes company.created back out, whether it just inserted
// the row or found it already there, so whichever service is waiting to
// unpause a paused record always gets an event to attach to.
export default async (event: CompanyRequested) => {
  const { default: CompanyService } = await import("../services/company.service.mjs");
  const service = new CompanyService();
  await service.findOrCreateFromRequest(event.body);
};
