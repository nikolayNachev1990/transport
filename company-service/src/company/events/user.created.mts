import type { BrokerEvent } from "@transport/core/broker";

interface UserCreated extends BrokerEvent {
  body: {
    id: string;
    company_id: string | null;
    created_by: string | null;
    company_role: string | null;
    email: string | null;
    name: string | null;
  };
}

// Dynamic import, not a top-level one — same deadlock reasoning as
// company.requested.mts. Ignores a plain self-service signup (company_id
// null) — only a company_user_create-minted identity stages here.
export default async (event: UserCreated) => {
  const { company_id, created_by, company_role, id, email, name } = event.body;
  if (!company_id || !created_by || !company_role) return;

  const { db } = await import("../../resources.mjs");
  await db.insert("pending_users", { id, email, name, company_role, company_id, created_by });
};
