import type { BrokerEvent } from "@transport/core/broker";

interface CompanyDeleted extends BrokerEvent {
  body: {
    id: string;
  };
}

export default async (event: CompanyDeleted) => {
  const { db } = await import("../../resources.mjs");
  // company_members has no ON DELETE CASCADE on this FK (it predates this
  // consumer) — deleted explicitly here rather than retrofitting the
  // constraint. users.company_id, by contrast, is a fresh column defined
  // with ON DELETE SET NULL, so that side clears itself.
  await db.deleteByWhere("company_members", { company_id: event.body.id });
  await db.deleteById("companies", event.body.id);
};
