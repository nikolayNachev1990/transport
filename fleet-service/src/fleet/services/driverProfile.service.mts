// SPEC-fleet-service.md §3.2. No separate create action exists (§10) —
// `update` upserts: `expected_version: 0` means "no profile exists yet",
// matching the version-conflict convention every other mutation uses
// instead of a bespoke "not found vs create" branch in the REST layer.
import { v7 as uuidv7 } from "uuid";
import { db, broker } from "../../resources.mjs";
import { encryptField, decryptField } from "@transport/core/crypt";
import { encryptionKey } from "../../config/security.mjs";
import { buildDiff, insertRevision } from "../lib/revisions.mjs";
import { publishAudit } from "../lib/audit.mjs";
import { DRIVER_PROFILE_UPDATE_FIELDS } from "../lib/driverProfileFields.mjs";

export type DriverProfileErrorCode = "FLEET_COMPANY_INACTIVE" | "FLEET_DRIVER_INACTIVE" | "FLEET_VERSION_CONFLICT" | "FLEET_NOT_FOUND";

export type DriverProfileResult<T> =
  | { ok: true; data: T; warnings: { code: string }[] }
  | { ok: false; code: DriverProfileErrorCode; currentVersion?: number };

interface DriverProfileRow extends Record<string, unknown> {
  company_id: string;
  user_id: string;
  version: number;
  personal_number_enc: Buffer | null;
  personal_number_last4: string | null;
}

function pickPresent(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in source) out[f] = source[f];
  return out;
}

const EVENT_FIELDS = [
  "company_id",
  "user_id",
  "birth_date",
  "birth_place",
  "nationality",
  "personal_number_last4",
  "address_line",
  "city",
  "postal_code",
  "country",
  "employee_number",
  "employment_start_date",
  "employment_end_date",
  "emergency_contact_name",
  "emergency_contact_phone",
  "notes",
  "source",
  "version",
  "created_at",
  "updated_at",
] as const;

async function publishUpserted(row: DriverProfileRow): Promise<void> {
  const body: Record<string, unknown> = {};
  for (const f of EVENT_FIELDS) body[f] = (row as Record<string, unknown>)[f] ?? null;
  await broker.send("fleet.driver_profile.upserted", body);
}

class DriverProfileService {
  async update(
    companyId: string,
    userId: string,
    patch: Record<string, unknown>,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<DriverProfileResult<{ id: string; version: number }>> {
    const presentFields = DRIVER_PROFILE_UPDATE_FIELDS.filter((f) => f in patch);
    const appliedPatch = pickPresent(patch, presentFields);

    const hasPersonalNumber = Object.prototype.hasOwnProperty.call(patch, "personal_number") && patch.personal_number != null;
    const personalNumberSets: Record<string, unknown> = hasPersonalNumber
      ? (() => {
          const raw = String(patch.personal_number).trim();
          return { personal_number_enc: encryptField(raw, encryptionKey), personal_number_last4: raw.slice(-4) };
        })()
      : {};

    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const driver = await trx("drivers").where({ company_id: companyId, user_id: userId }).whereNull("deleted_at").first();
      if (!driver || !driver.is_active) return { ok: false, code: "FLEET_DRIVER_INACTIVE" } as const;

      const current = (await trx("driver_profiles").where({ company_id: companyId, user_id: userId }).whereNull("deleted_at").first()) as
        | DriverProfileRow
        | undefined;

      if (!current) {
        if (expectedVersion !== 0) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: 0 } as const;

        const sets = {
          company_id: companyId,
          user_id: userId,
          ...appliedPatch,
          ...personalNumberSets,
          version: 1,
          source: "manual",
          created_by: actorUserId,
          updated_by: actorUserId,
        };
        const [inserted] = await trx("driver_profiles").insert(sets).returning("*");

        const changes = buildDiff(null, inserted, [...presentFields, ...(hasPersonalNumber ? ["personal_number"] : [])]) ?? {};
        await insertRevision(trx, {
          companyId,
          entityType: "driver_profile",
          entityId: userId,
          revision: 1,
          action: "create",
          changes,
          source: "manual",
          actorUserId,
        });

        return { ok: true, data: inserted as DriverProfileRow, noChange: false } as const;
      }

      if (current.version !== expectedVersion) {
        return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;
      }

      const merged = { ...current, ...appliedPatch, ...personalNumberSets };
      const changes = buildDiff(current, merged, [...presentFields, ...(hasPersonalNumber ? ["personal_number"] : [])]);
      if (!changes) return { ok: true, data: current, noChange: true } as const;

      const sets = { ...appliedPatch, ...personalNumberSets, version: current.version + 1, updated_by: actorUserId };
      const [updated] = await trx("driver_profiles").update(sets).where({ company_id: companyId, user_id: userId }).returning("*");

      await insertRevision(trx, {
        companyId,
        entityType: "driver_profile",
        entityId: userId,
        revision: updated.version,
        action: "update",
        changes,
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: updated as DriverProfileRow, noChange: false } as const;
    });

    if (!result.ok) return result;
    if (!result.noChange) {
      await publishUpserted(result.data);
      await publishAudit(companyId, actorUserId, "fleet_driver_profile.updated", "driver_profile", userId);
    }
    return { ok: true, data: { id: result.data.user_id, version: result.data.version }, warnings: [] };
  }

  // §9: full value only for owner/transport_manager (enforced by the REST
  // layer's role check, not here) — every reveal is itself an auditable
  // action, per spec ("Action fleet_reveal_number с audit.action").
  async revealPersonalNumber(
    companyId: string,
    userId: string,
    actorUserId: string,
  ): Promise<{ ok: true; value: string | null } | { ok: false; code: "FLEET_NOT_FOUND" }> {
    const row = (await db.findByWhere<DriverProfileRow>("driver_profiles", { company_id: companyId, user_id: userId })) as
      | DriverProfileRow
      | null;
    if (!row) return { ok: false, code: "FLEET_NOT_FOUND" };

    const value = row.personal_number_enc ? decryptField(Buffer.from(row.personal_number_enc), encryptionKey) : null;
    await publishAudit(companyId, actorUserId, "fleet_driver_profile.number_revealed", "driver_profile", userId);
    return { ok: true, value };
  }
}

export default DriverProfileService;
