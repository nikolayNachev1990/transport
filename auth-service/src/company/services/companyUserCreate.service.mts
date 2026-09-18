import randomstring from "randomstring";
import { db } from "../../resources.mjs";

// "не driver" per spec — drivers are a separate, later stage (phone/SMS
// invite flow, not this identity-based one).
const ALLOWED_ROLES = ["owner", "transport_manager", "dispatcher", "accountant"] as const;
type CompanyRole = (typeof ALLOWED_ROLES)[number];

export interface CreateCompanyUserInput {
  companyId: string;
  callerId: string;
  email: string;
  name: string;
  companyRole: string;
}

export interface CreatedUser {
  id: string;
  name: string | null;
  email: string | null;
  activation_token: string;
  active: boolean;
  role: string;
  created_at: string;
  updated_at: string;
}

export type CreateCompanyUserResult =
  | { ok: true; user: CreatedUser }
  | {
      ok: false;
      code:
        | "INVALID_COMPANY_ROLE"
        | "COMPANY_NOT_FOUND"
        | "NOT_ACTIVE_OWNER"
        | "NOT_CREATOR"
        | "EMAIL_ALREADY_USED"
        | "OWNER_LIMIT_REACHED"
        | "STAFF_LIMIT_REACHED";
    };

// The whole check-and-create sequence runs in one transaction, per spec:
// FOR UPDATE on the company row is what makes the owner/staff-limit
// counts race-safe against two concurrent company_user_create calls for
// the same company.
export async function createCompanyUser(input: CreateCompanyUserInput): Promise<CreateCompanyUserResult> {
  if (!ALLOWED_ROLES.includes(input.companyRole as CompanyRole)) {
    return { ok: false, code: "INVALID_COMPANY_ROLE" };
  }

  const knex = db.client();
  return knex.transaction(async (trx): Promise<CreateCompanyUserResult> => {
    const companyResult = await trx.raw(`SELECT id, subscription_plan FROM companies WHERE id = :id FOR UPDATE`, { id: input.companyId });
    const company = companyResult.rows[0] as { id: string; subscription_plan: string | null } | undefined;
    if (!company) return { ok: false, code: "COMPANY_NOT_FOUND" };

    const callerResult = await trx.raw(
      `SELECT is_creator FROM company_members
       WHERE user_id = :callerId AND company_id = :companyId AND company_role = 'owner' AND is_active = true AND deleted_at IS NULL`,
      { callerId: input.callerId, companyId: input.companyId },
    );
    const caller = callerResult.rows[0] as { is_creator: boolean } | undefined;
    if (!caller) return { ok: false, code: "NOT_ACTIVE_OWNER" };

    // Only the company's creator may hand out the owner role itself —
    // any active owner can create staff.
    if (input.companyRole === "owner" && !caller.is_creator) {
      return { ok: false, code: "NOT_CREATOR" };
    }

    const emailResult = await trx.raw(`SELECT id FROM users WHERE email = :email`, { email: input.email });
    if (emailResult.rows[0]) return { ok: false, code: "EMAIL_ALREADY_USED" };

    const planResult = company.subscription_plan
      ? await trx.raw(`SELECT max_owners, max_staff FROM plans WHERE code = :code`, { code: company.subscription_plan })
      : null;
    const plan = planResult?.rows[0] as { max_owners: number | null; max_staff: number | null } | undefined;

    if (input.companyRole === "owner") {
      if (plan?.max_owners != null) {
        const countResult = await trx.raw(
          `SELECT count(*) AS count FROM company_members WHERE company_id = :companyId AND company_role = 'owner' AND deleted_at IS NULL`,
          { companyId: input.companyId },
        );
        if (Number(countResult.rows[0].count) >= plan.max_owners) return { ok: false, code: "OWNER_LIMIT_REACHED" };
      }
    } else if (plan?.max_staff != null) {
      // Sums every member's own counter, including members who are
      // themselves deactivated/deleted — a company's used-up staff
      // capacity doesn't free up just because the person who created
      // those accounts later left (see spec rule 5c).
      const sumResult = await trx.raw(`SELECT COALESCE(SUM(users_created_count), 0) AS total FROM company_members WHERE company_id = :companyId`, {
        companyId: input.companyId,
      });
      if (Number(sumResult.rows[0].total) >= plan.max_staff) return { ok: false, code: "STAFF_LIMIT_REACHED" };
    }

    const activationToken = randomstring.generate({ length: 12, charset: "alphabetic" });
    const insertResult = await trx.raw(
      `INSERT INTO users (name, email, active, activation_token, company_id, created_by, company_role)
       VALUES (:name, :email, false, :activationToken, :companyId, :callerId, :companyRole)
       RETURNING id, name, email, activation_token, active, role, created_at, updated_at`,
      { name: input.name, email: input.email, activationToken, companyId: input.companyId, callerId: input.callerId, companyRole: input.companyRole },
    );
    const user = insertResult.rows[0] as CreatedUser;

    await trx.raw(`UPDATE company_members SET users_created_count = users_created_count + 1 WHERE user_id = :callerId AND company_id = :companyId`, {
      callerId: input.callerId,
      companyId: input.companyId,
    });

    return { ok: true, user };
  });
}
