import type { BrokerEvent } from "@transport/core/broker";

interface CompanyCreated extends BrokerEvent {
  body: {
    id: string;
    creator_user_id: string | null;
    subscription_plan: string | null;
    subscription_valid_until: string | null;
    is_active: boolean;
  };
}

// Dynamic import, not a top-level one — this file is imported by
// config/broker.mts's consumer scan, which resources.mjs's own broker
// creation runs during its top-level await; a top-level
// `import { db } from "../../resources.mjs"` here would deadlock (see
// deviceTokens/events/invalidDeviceToken.deleted.mts's note for the full
// explanation).
export default async (event: CompanyCreated) => {
  const { id, creator_user_id, subscription_plan, subscription_valid_until, is_active } = event.body;

  const { db } = await import("../../resources.mjs");
  await db.client().transaction(async (trx) => {
    await trx.raw(
      `INSERT INTO companies (id, creator_user_id, subscription_plan, subscription_valid_until, is_active)
       VALUES (:id, :creator_user_id, :subscription_plan, :subscription_valid_until, :is_active)
       ON CONFLICT (id) DO UPDATE SET
         creator_user_id = EXCLUDED.creator_user_id,
         subscription_plan = EXCLUDED.subscription_plan,
         subscription_valid_until = EXCLUDED.subscription_valid_until,
         is_active = EXCLUDED.is_active`,
      { id, creator_user_id, subscription_plan, subscription_valid_until, is_active },
    );

    // The creator becomes the company's first owner the instant it
    // exists — mutation 1 (company_user_create, a later stage) requires
    // an active owner membership to check the caller against, and
    // without this seed there would be no way for a brand-new company to
    // ever get one. Skipped entirely for a company.requested-triggered
    // company, which has no human creator yet.
    if (creator_user_id) {
      await trx.raw(
        `INSERT INTO company_members (user_id, company_id, company_role, is_active, deleted_at, is_creator, created_by)
         VALUES (:user_id, :company_id, 'owner', true, NULL, true, :user_id)
         ON CONFLICT (user_id, company_id) DO UPDATE SET
           company_role = EXCLUDED.company_role,
           is_active = EXCLUDED.is_active,
           deleted_at = EXCLUDED.deleted_at,
           is_creator = EXCLUDED.is_creator,
           created_by = EXCLUDED.created_by`,
        { user_id: creator_user_id, company_id: id },
      );
    }
  });
};
