import { randomUUID } from "node:crypto";
import type { AuditAction } from "@transport/core/audit";
import { db, broker } from "../../resources.mjs";

const STAFF_ROLES = ["transport_manager", "dispatcher", "accountant"] as const;
const ASSIGNABLE_ROLES = ["owner", ...STAFF_ROLES] as const;

export interface MemberRow {
  user_id: string;
  company_id: string;
  company_role: string;
  is_active: boolean;
  is_creator: boolean;
  created_by: string | null;
  activated_at: Date | null;
  deleted_at: Date | null;
}

class MemberService {
  // Called in-process from company.service.mts right after a company row
  // is inserted (never as an event consumer of its own company.created —
  // this service is that event's producer, no round trip needed). No
  // companyMember.created publish here: auth-service already derives the
  // creator's own auth_db.company_members row directly from
  // company.created's creator_user_id (see auth-service's own consumer),
  // so a second event would just be a redundant, race-prone duplicate of
  // the same fact.
  async seedCreator(companyId: string, creatorUserId: string) {
    await db.raw(
      `INSERT INTO members (user_id, company_id, company_role, is_active, is_creator, created_by, activated_at)
       VALUES (:userId, :companyId, 'owner', true, true, :userId, now())
       ON CONFLICT (user_id, company_id) DO NOTHING`,
      { userId: creatorUserId, companyId },
    );
  }

  // Mutation 2 (company_user_link) — per spec rule 7, "caller is an
  // active owner of company_id" is satisfied by the session itself
  // (Hasura's "owner" role permission + X-Hasura-Company-Id, both
  // already verified by auth-hook's real company_members check); this
  // service has no access to auth_db to re-verify it independently.
  async linkPendingUser(input: { companyId: string; callerId: string; email: string }): Promise<
    { ok: true; userId: string; created: boolean } | { ok: false; code: "PENDING_USER_NOT_FOUND" }
  > {
    const pending = await db.findByWhere<{ id: string; company_role: string }>("pending_users", {
      email: input.email,
      company_id: input.companyId,
      created_by: input.callerId,
    });
    if (!pending || Array.isArray(pending)) return { ok: false, code: "PENDING_USER_NOT_FOUND" };

    const result = await db.raw<{ rows: MemberRow[] }>(
      `INSERT INTO members (user_id, company_id, company_role, is_active, is_creator, created_by)
       VALUES (:userId, :companyId, :companyRole, false, false, :createdBy)
       ON CONFLICT (user_id, company_id) DO NOTHING
       RETURNING *`,
      { userId: pending.id, companyId: input.companyId, companyRole: pending.company_role, createdBy: input.callerId },
    );

    // Idempotent per spec — a repeat call for an already-linked pending
    // user is a no-op success, not an error, and doesn't re-publish.
    const row = result?.rows[0];
    if (row) {
      await broker.send("companyMember.created", {
        user_id: row.user_id,
        company_id: row.company_id,
        company_role: row.company_role,
        is_active: row.is_active,
        is_creator: row.is_creator,
        created_by: row.created_by,
      });
    }

    return { ok: true, userId: pending.id, created: Boolean(row) };
  }

  // Consumed from user.activated — the only transition this makes is
  // pending -> active, guarded by activated_at (never re-activates a
  // member who was since deactivated; see spec rule 8).
  async activate(userId: string) {
    const result = await db.raw<{ rows: MemberRow[] }>(
      `UPDATE members SET is_active = true, activated_at = now()
       WHERE user_id = :userId AND activated_at IS NULL
       RETURNING *`,
      { userId },
    );
    const row = result?.rows[0];
    if (!row) return;

    await broker.send("companyMember.activated", { user_id: row.user_id, company_id: row.company_id });
  }

  // "Шефове" (spec rule 9) — the only mutation that changes an existing
  // member's role. Hasura's action permission already restricts the
  // caller to an active owner of the session's company; the extra
  // is_creator check below is specifically for the owner role itself
  // (assigning or removing it), which only the company's creator may do.
  async updateRole(input: { companyId: string; callerId: string; userId: string; companyRole: string }): Promise<
    | { ok: true }
    | { ok: false; code: "INVALID_COMPANY_ROLE" | "MEMBER_NOT_FOUND" | "CANNOT_CHANGE_CREATOR" | "NOT_CREATOR" | "OWNER_LIMIT_REACHED" }
  > {
    if (!(ASSIGNABLE_ROLES as readonly string[]).includes(input.companyRole)) {
      return { ok: false, code: "INVALID_COMPANY_ROLE" };
    }

    const knex = db.client();
    return knex.transaction(async (trx) => {
      const companyResult = await trx.raw(`SELECT id, subscription_plan FROM companies WHERE id = :id FOR UPDATE`, { id: input.companyId });
      const company = companyResult.rows[0] as { subscription_plan: string | null } | undefined;
      if (!company) return { ok: false, code: "MEMBER_NOT_FOUND" };

      const targetResult = await trx.raw(
        `SELECT company_role, is_creator FROM members WHERE user_id = :userId AND company_id = :companyId AND deleted_at IS NULL`,
        { userId: input.userId, companyId: input.companyId },
      );
      const target = targetResult.rows[0] as { company_role: string; is_creator: boolean } | undefined;
      if (!target) return { ok: false, code: "MEMBER_NOT_FOUND" };
      if (target.is_creator) return { ok: false, code: "CANNOT_CHANGE_CREATOR" };

      const involvesOwnerRole = target.company_role === "owner" || input.companyRole === "owner";
      if (involvesOwnerRole) {
        const callerResult = await trx.raw(
          `SELECT is_creator FROM members WHERE user_id = :callerId AND company_id = :companyId AND is_active = true AND deleted_at IS NULL`,
          { callerId: input.callerId, companyId: input.companyId },
        );
        const caller = callerResult.rows[0] as { is_creator: boolean } | undefined;
        if (!caller?.is_creator) return { ok: false, code: "NOT_CREATOR" };
      }

      if (input.companyRole === "owner" && target.company_role !== "owner") {
        const planResult = company.subscription_plan
          ? await trx.raw(`SELECT max_owners FROM plans WHERE code = :code`, { code: company.subscription_plan })
          : null;
        const plan = planResult?.rows[0] as { max_owners: number | null } | undefined;
        if (plan?.max_owners != null) {
          const countResult = await trx.raw(
            `SELECT count(*) AS count FROM members WHERE company_id = :companyId AND company_role = 'owner' AND is_active = true AND deleted_at IS NULL`,
            { companyId: input.companyId },
          );
          if (Number(countResult.rows[0].count) >= plan.max_owners) return { ok: false, code: "OWNER_LIMIT_REACHED" };
        }
      }

      await trx.raw(`UPDATE members SET company_role = :role WHERE user_id = :userId AND company_id = :companyId`, {
        role: input.companyRole,
        userId: input.userId,
        companyId: input.companyId,
      });

      return { ok: true };
    });
  }

  // The downgrade function (spec rule 10, as refined): never deletes,
  // only deactivates — newest members first — until the active headcount
  // fits the current plan. Called from updateCompany's own plan-change
  // branch, and from the subscription-expiry cron tick; a later
  // billing-service caller reuses the same function once it exists. The
  // creator is never touched and doesn't count against the owner slots
  // being freed (they occupy one permanently).
  async downgradeToFit(companyId: string): Promise<void> {
    const knex = db.client();
    const deactivated: string[] = [];

    await knex.transaction(async (trx) => {
      const companyResult = await trx.raw(`SELECT subscription_plan FROM companies WHERE id = :id FOR UPDATE`, { id: companyId });
      const company = companyResult.rows[0] as { subscription_plan: string | null } | undefined;
      if (!company?.subscription_plan) return;

      const planResult = await trx.raw(`SELECT max_owners, max_staff FROM plans WHERE code = :code`, { code: company.subscription_plan });
      const plan = planResult.rows[0] as { max_owners: number | null; max_staff: number | null } | undefined;
      if (!plan) return;

      const deactivateExcess = async (roleFilter: string, keep: number | null) => {
        if (keep == null) return;
        const rowsResult = await trx.raw(
          `SELECT user_id FROM members
           WHERE company_id = :companyId AND is_active = true AND deleted_at IS NULL AND is_creator = false AND ${roleFilter}
           ORDER BY created_at DESC`,
          { companyId },
        );
        const rows = rowsResult.rows as { user_id: string }[];
        const excess = rows.slice(0, Math.max(rows.length - keep, 0));
        for (const row of excess) {
          await trx.raw(`UPDATE members SET is_active = false WHERE user_id = :userId AND company_id = :companyId`, {
            userId: row.user_id,
            companyId,
          });
          deactivated.push(row.user_id);
        }
      };

      // The creator permanently occupies one owner slot and is excluded
      // from this query entirely (is_creator = false above) — the
      // remaining non-creator owners must fit in whatever's left of
      // max_owners.
      await deactivateExcess("company_role = 'owner'", plan.max_owners == null ? null : Math.max(plan.max_owners - 1, 0));
      await deactivateExcess(`company_role IN ('${STAFF_ROLES.join("','")}')`, plan.max_staff);
    });

    const action: AuditAction = "company_member.deactivated_by_downgrade";
    for (const userId of deactivated) {
      await broker.send("companyMember.updated", { user_id: userId, company_id: companyId, is_active: false });
      await broker.send("audit.action", {
        event_id: randomUUID(),
        // System-triggered (plan change or expiry tick, not one specific
        // HTTP caller) — an all-zero sentinel, not a real user id.
        actor_user_id: "00000000-0000-0000-0000-000000000000",
        company_id: companyId,
        action,
        target_type: "user",
        target_id: userId,
        at: new Date(),
      });
    }
  }

  // "Триене" (spec rule 11) — always a soft delete of the membership row,
  // never removed. Hasura's action permission already restricts the
  // caller to an active member of the session's company; the extra
  // owner-or-created-it check below is this mutation's own authorization
  // rule, not something the session alone proves.
  async deleteMember(input: { companyId: string; callerId: string; targetUserId: string }): Promise<
    { ok: true } | { ok: false; code: "CANNOT_DELETE_SELF" | "MEMBER_NOT_FOUND" | "CANNOT_DELETE_CREATOR" | "NOT_ALLOWED" }
  > {
    if (input.targetUserId === input.callerId) return { ok: false, code: "CANNOT_DELETE_SELF" };

    const target = await db.findByWhere<{ is_creator: boolean; created_by: string | null }>("members", {
      user_id: input.targetUserId,
      company_id: input.companyId,
      deleted_at: null,
    });
    if (!target || Array.isArray(target)) return { ok: false, code: "MEMBER_NOT_FOUND" };
    if (target.is_creator) return { ok: false, code: "CANNOT_DELETE_CREATOR" };

    const caller = await db.findByWhere<{ company_role: string }>("members", {
      user_id: input.callerId,
      company_id: input.companyId,
      is_active: true,
      deleted_at: null,
    });
    const callerIsOwner = caller != null && !Array.isArray(caller) && caller.company_role === "owner";
    if (!callerIsOwner && target.created_by !== input.callerId) {
      return { ok: false, code: "NOT_ALLOWED" };
    }

    const result = await db.raw<{ rows: { user_id: string; company_id: string; created_by: string | null }[] }>(
      `UPDATE members SET is_active = false, deleted_at = now()
       WHERE user_id = :userId AND company_id = :companyId AND deleted_at IS NULL
       RETURNING user_id, company_id, created_by`,
      { userId: input.targetUserId, companyId: input.companyId },
    );
    const row = result?.rows[0];
    if (row) {
      await broker.send("companyMember.deleted", { user_id: row.user_id, company_id: row.company_id, created_by: row.created_by });
    }

    return { ok: true };
  }
}

export default MemberService;
