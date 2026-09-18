import type { BrokerEvent } from "@transport/core/broker";

interface CompanyMemberDeleted extends BrokerEvent {
  body: {
    user_id: string;
    company_id: string;
    created_by: string | null;
  };
}

// Dynamic import, not a top-level one — same deadlock reasoning as
// company.created.mts. Per spec rule 11: the identity row is soft-
// deleted (deleted_at set) and its email cleared — this is what actually
// frees the email for reuse, since every company_user_create-minted
// identity is single-company in practice (mutation 1 already rejects a
// duplicate email, so there's no other membership left to protect).
// users_created_count on the creator's row is decremented only on the
// NULL -> value transition, guarding a redelivered event from double-
// decrementing.
export default async (event: CompanyMemberDeleted) => {
  const { user_id, company_id, created_by } = event.body;

  const { db } = await import("../../resources.mjs");
  await db.client().transaction(async (trx) => {
    await trx.raw(`UPDATE company_members SET is_active = false, deleted_at = now() WHERE user_id = :userId AND company_id = :companyId`, {
      userId: user_id,
      companyId: company_id,
    });

    const identityResult = await trx.raw(
      `UPDATE users SET deleted_at = now(), active = false, email = NULL
       WHERE id = :userId AND deleted_at IS NULL
       RETURNING id`,
      { userId: user_id },
    );

    if (identityResult.rows[0] && created_by) {
      await trx.raw(
        `UPDATE company_members SET users_created_count = GREATEST(users_created_count - 1, 0)
         WHERE user_id = :createdBy AND company_id = :companyId`,
        { createdBy: created_by, companyId: company_id },
      );
    }
  });

  const { clearCompanyMembershipCache } = await import("../services/companyMembership.service.mjs");
  await clearCompanyMembershipCache(user_id, company_id);
};
