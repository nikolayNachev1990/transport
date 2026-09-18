// SPEC-fleet-service.md §3.3, §6, §8 — vehicle create/update/status/
// delete/restore/registration-change. Every mutation: version check in
// the same transaction as the write, one entity_revisions row, then
// (outside the transaction, once committed) the fleet.vehicle.upserted/
// deleted event and an audit.action.
import { v7 as uuidv7 } from "uuid";
import { db, broker } from "../../resources.mjs";
import { normalizeRegistrationNumber, normalizeVin } from "../lib/normalize.mjs";
import { isCompanyActive, isUnderUnitLimit, isCountedStatus } from "../lib/limits.mjs";
import { buildDiff, insertRevision } from "../lib/revisions.mjs";
import { openRegistration, closeOpenRegistration, today } from "../lib/registrations.mjs";
import { publishAudit } from "../lib/audit.mjs";
import { VEHICLE_ALL_FIELDS, VEHICLE_UPDATE_FIELDS, VEHICLE_STATUSES } from "../lib/vehicleFields.mjs";

export type VehicleErrorCode =
  | "FLEET_COMPANY_INACTIVE"
  | "FLEET_UNIT_LIMIT_REACHED"
  | "FLEET_DUPLICATE_VIN"
  | "FLEET_DUPLICATE_REGISTRATION"
  | "FLEET_DUPLICATE_INTERNAL_CODE"
  | "FLEET_INVALID_VIN"
  | "FLEET_INVALID_REGISTRATION_NUMBER"
  | "FLEET_INVALID_DATE_RANGE"
  | "FLEET_VERSION_CONFLICT"
  | "FLEET_NOT_FOUND";

export type VehicleResult<T> =
  | { ok: true; data: T; warnings: { code: string }[] }
  | { ok: false; code: VehicleErrorCode; currentVersion?: number };

interface VehicleRow extends Record<string, unknown> {
  id: string;
  company_id: string;
  version: number;
  status: string;
  vehicle_category: string | null;
  tachograph_type: string | null;
  first_registration_date: string | null;
  current_registration_date: string | null;
  registration_number: string;
  registration_country: string;
  registration_certificate_number: string | null;
}

function pickFields(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f] = source[f] ?? null;
  return out;
}

function pickPresent(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in source) out[f] = source[f];
  return out;
}

// "status" isn't in VEHICLE_ALL_FIELDS (it's only settable via setStatus,
// not create/update) but the event snapshot still has to carry it.
const EVENT_FIELDS = [...VEHICLE_ALL_FIELDS, "id", "company_id", "status", "source", "version", "created_at", "updated_at"] as const;

async function publishUpserted(row: VehicleRow): Promise<void> {
  await broker.send("fleet.vehicle.upserted", pickFields(row, EVENT_FIELDS));
}

function computeWarnings(row: Partial<VehicleRow>): { code: string }[] {
  const warnings: { code: string }[] = [];
  if ((row.vehicle_category === "N2" || row.vehicle_category === "N3") && row.tachograph_type === "none") {
    warnings.push({ code: "FLEET_WARN_TACHOGRAPH_REQUIRED" });
  }
  return warnings;
}

// §5.3 — only the one rule that's checkable without documents (Etap 4).
function checkDateRange(row: Record<string, unknown>): boolean {
  const first = row.first_registration_date;
  const current = row.current_registration_date;
  if (first && current) return String(first) <= String(current);
  return true;
}

const UNIQUE_VIOLATION = "23505";
function mapUniqueViolation(error: unknown): VehicleErrorCode | null {
  const err = error as { code?: string; constraint?: string };
  if (err?.code !== UNIQUE_VIOLATION) return null;
  if (err.constraint === "vehicles_vin_uq") return "FLEET_DUPLICATE_VIN";
  if (err.constraint === "vehicles_reg_uq") return "FLEET_DUPLICATE_REGISTRATION";
  if (err.constraint === "vehicles_internal_code_uq") return "FLEET_DUPLICATE_INTERNAL_CODE";
  return null;
}

class VehicleService {
  async create(
    input: Record<string, unknown>,
    companyId: string,
    actorUserId: string,
    source = "manual",
    // Set only when this create is the result of confirming a recognition
    // proposal (SPEC-fleet-service.md §13 step 4/6) — links the new row
    // back to its extraction and logs a 'confirm' revision instead of
    // 'create', matching that section's own wording.
    aiMeta?: { extractionId: string; confirmedBy: string },
  ): Promise<VehicleResult<{ id: string; version: number }>> {
    const regNumber = normalizeRegistrationNumber(input.registration_number as string);
    if (regNumber === null) return { ok: false, code: "FLEET_INVALID_REGISTRATION_NUMBER" };
    const vin = normalizeVin(input.vin as string);
    if (vin === null) return { ok: false, code: "FLEET_INVALID_VIN" };

    const candidate = { ...input, registration_number: regNumber, vin };
    if (!checkDateRange(candidate)) return { ok: false, code: "FLEET_INVALID_DATE_RANGE" };

    const knex = db.client();
    let result: { ok: true; data: VehicleRow } | { ok: false; code: VehicleErrorCode };
    try {
      result = await knex.transaction(async (trx) => {
        if (!(await isCompanyActive(trx, companyId))) return { ok: false, code: "FLEET_COMPANY_INACTIVE" } as const;
        if (!(await isUnderUnitLimit(trx, companyId))) return { ok: false, code: "FLEET_UNIT_LIMIT_REACHED" } as const;

        const id = uuidv7();
        const sets = {
          id,
          company_id: companyId,
          // Only present keys — omitted ones (operation_scope, ownership_type,
          // adr_equipped, ...) must fall through to their column DEFAULT,
          // not an explicit NULL that would violate NOT NULL constraints.
          ...pickPresent(candidate, VEHICLE_ALL_FIELDS),
          version: 1,
          source,
          created_by: actorUserId,
          updated_by: actorUserId,
          ...(aiMeta ? { extraction_id: aiMeta.extractionId, confirmed_by: aiMeta.confirmedBy, confirmed_at: new Date() } : {}),
        };
        const [inserted] = await trx("vehicles").insert(sets).returning("*");

        await openRegistration(trx, {
          companyId,
          vehicleId: id,
          registrationNumber: regNumber,
          registrationCountry: inserted.registration_country,
          certificateNumber: inserted.registration_certificate_number,
          from: (inserted.first_registration_date as string | null) ?? today(),
          actorUserId,
          source,
        });

        const changes = buildDiff(null, inserted, VEHICLE_ALL_FIELDS) ?? {};
        await insertRevision(trx, {
          companyId,
          entityType: "vehicle",
          entityId: id,
          revision: 1,
          action: aiMeta ? "confirm" : "create",
          changes,
          source,
          actorUserId,
          extractionId: aiMeta?.extractionId ?? null,
        });

        return { ok: true, data: inserted as VehicleRow } as const;
      });
    } catch (error) {
      const mapped = mapUniqueViolation(error);
      if (mapped) return { ok: false, code: mapped };
      throw error;
    }

    if (!result.ok) return result;

    await publishUpserted(result.data);
    await publishAudit(companyId, actorUserId, "fleet_vehicle.created", "vehicle", result.data.id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: computeWarnings(result.data) };
  }

  async update(
    id: string,
    companyId: string,
    patch: Record<string, unknown>,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<VehicleResult<{ id: string; version: number }>> {
    const presentFields = VEHICLE_UPDATE_FIELDS.filter((f) => f in patch);
    const appliedPatch = pickPresent(patch, presentFields);

    if (appliedPatch.vin !== undefined) {
      const vin = normalizeVin(appliedPatch.vin as string);
      if (vin === null) return { ok: false, code: "FLEET_INVALID_VIN" };
      appliedPatch.vin = vin;
    }

    const knex = db.client();
    let result:
      | { ok: true; data: VehicleRow; noChange: boolean }
      | { ok: false; code: VehicleErrorCode; currentVersion?: number };
    try {
      result = await knex.transaction(async (trx) => {
        const current = (await trx("vehicles").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as
          | VehicleRow
          | undefined;
        if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
        if (current.version !== expectedVersion) {
          return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;
        }
        if (!(await isCompanyActive(trx, companyId))) return { ok: false, code: "FLEET_COMPANY_INACTIVE" } as const;

        const merged = { ...current, ...appliedPatch };
        if (!checkDateRange(merged)) return { ok: false, code: "FLEET_INVALID_DATE_RANGE" } as const;

        const changes = buildDiff(current, merged, presentFields);
        if (!changes) return { ok: true, data: current, noChange: true } as const;

        const sets = { ...appliedPatch, version: current.version + 1, updated_by: actorUserId };
        const [updated] = await trx("vehicles").update(sets).where({ id }).returning("*");

        await insertRevision(trx, {
          companyId,
          entityType: "vehicle",
          entityId: id,
          revision: updated.version,
          action: "update",
          changes,
          source: "manual",
          actorUserId,
        });

        return { ok: true, data: updated as VehicleRow, noChange: false } as const;
      });
    } catch (error) {
      const mapped = mapUniqueViolation(error);
      if (mapped) return { ok: false, code: mapped };
      throw error;
    }

    if (!result.ok) return result;
    if (!result.noChange) {
      await publishUpserted(result.data);
      await publishAudit(companyId, actorUserId, "fleet_vehicle.updated", "vehicle", id);
    }
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: computeWarnings(result.data) };
  }

  async setStatus(
    id: string,
    companyId: string,
    newStatus: string,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<VehicleResult<{ id: string; version: number }>> {
    if (!(VEHICLE_STATUSES as readonly string[]).includes(newStatus)) {
      return { ok: false, code: "FLEET_INVALID_DATE_RANGE" }; // unreachable: ajv enum already rejects this at REST layer
    }

    const knex = db.client();
    let result:
      | { ok: true; data: VehicleRow; noChange: boolean }
      | { ok: false; code: VehicleErrorCode; currentVersion?: number };
    try {
      result = await knex.transaction(async (trx) => {
        const current = (await trx("vehicles").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as
          | VehicleRow
          | undefined;
        if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
        if (current.version !== expectedVersion) {
          return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;
        }
        if (!(await isCompanyActive(trx, companyId))) return { ok: false, code: "FLEET_COMPANY_INACTIVE" } as const;
        if (current.status === newStatus) return { ok: true, data: current, noChange: true } as const;

        // §8: only entering a counted status from a non-counted one needs
        // the limit re-checked — leaving one (to sold/scrapped) only frees
        // a slot, and moving between two counted statuses doesn't change
        // the count at all.
        if (!isCountedStatus(current.status) && isCountedStatus(newStatus)) {
          if (!(await isUnderUnitLimit(trx, companyId))) return { ok: false, code: "FLEET_UNIT_LIMIT_REACHED" } as const;
        }

        const sets: Record<string, unknown> = { status: newStatus, version: current.version + 1, updated_by: actorUserId };
        if (newStatus === "sold") sets.sale_date = today();
        if (newStatus === "scrapped") sets.deregistration_date = today();

        const [updated] = await trx("vehicles").update(sets).where({ id }).returning("*");

        // Closing open combinations/vehicle_drivers on sold/scrapped
        // (spec §6) is deferred: those tables don't exist until Etap 3.
        const changes = buildDiff(current, updated, ["status", "sale_date", "deregistration_date"]) ?? {};
        await insertRevision(trx, {
          companyId,
          entityType: "vehicle",
          entityId: id,
          revision: updated.version,
          action: "status_change",
          changes,
          source: "manual",
          actorUserId,
        });

        return { ok: true, data: updated as VehicleRow, noChange: false } as const;
      });
    } catch (error) {
      throw error;
    }

    if (!result.ok) return result;
    if (!result.noChange) {
      await publishUpserted(result.data);
      await publishAudit(companyId, actorUserId, "fleet_vehicle.status_changed", "vehicle", id);
    }
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }

  async delete(
    id: string,
    companyId: string,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<VehicleResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = (await trx("vehicles").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as
        | VehicleRow
        | undefined;
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) {
        return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;
      }
      if (!(await isCompanyActive(trx, companyId))) return { ok: false, code: "FLEET_COMPANY_INACTIVE" } as const;

      const sets = { deleted_at: new Date(), deleted_by: actorUserId, version: current.version + 1, updated_by: actorUserId };
      const [updated] = await trx("vehicles").update(sets).where({ id }).returning("*");

      const changes = buildDiff(current, updated, ["deleted_at", "deleted_by"]) ?? {};
      await insertRevision(trx, {
        companyId,
        entityType: "vehicle",
        entityId: id,
        revision: updated.version,
        action: "delete",
        changes,
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: updated as VehicleRow } as const;
    });

    if (!result.ok) return result;
    await broker.send("fleet.vehicle.deleted", {
      id: result.data.id,
      company_id: companyId,
      deleted_at: result.data.deleted_at,
      deleted_by: result.data.deleted_by,
    });
    await publishAudit(companyId, actorUserId, "fleet_vehicle.deleted", "vehicle", id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }

  async restore(
    id: string,
    companyId: string,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<VehicleResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = (await trx("vehicles").where({ id, company_id: companyId }).whereNotNull("deleted_at").first()) as
        | VehicleRow
        | undefined;
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) {
        return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;
      }
      if (!(await isCompanyActive(trx, companyId))) return { ok: false, code: "FLEET_COMPANY_INACTIVE" } as const;
      if (isCountedStatus(current.status) && !(await isUnderUnitLimit(trx, companyId))) {
        return { ok: false, code: "FLEET_UNIT_LIMIT_REACHED" } as const;
      }

      const sets = { deleted_at: null, deleted_by: null, version: current.version + 1, updated_by: actorUserId };
      const [updated] = await trx("vehicles").update(sets).where({ id }).returning("*");

      const changes = buildDiff(current, updated, ["deleted_at", "deleted_by"]) ?? {};
      await insertRevision(trx, {
        companyId,
        entityType: "vehicle",
        entityId: id,
        revision: updated.version,
        action: "restore",
        changes,
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: updated as VehicleRow } as const;
    });

    if (!result.ok) return result;
    await publishUpserted(result.data);
    await publishAudit(companyId, actorUserId, "fleet_vehicle.restored", "vehicle", id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }

  async changeRegistration(
    id: string,
    companyId: string,
    input: { registrationNumber: string; registrationCountry: string; certificateNumber?: string | null },
    expectedVersion: number,
    actorUserId: string,
  ): Promise<VehicleResult<{ id: string; version: number }>> {
    const regNumber = normalizeRegistrationNumber(input.registrationNumber);
    if (regNumber === null) return { ok: false, code: "FLEET_INVALID_REGISTRATION_NUMBER" };

    const knex = db.client();
    let result:
      | { ok: true; data: VehicleRow & { old_registration_number: string; old_registration_country: string } }
      | { ok: false; code: VehicleErrorCode; currentVersion?: number };
    try {
      result = await knex.transaction(async (trx) => {
        const current = (await trx("vehicles").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as
          | VehicleRow
          | undefined;
        if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
        if (current.version !== expectedVersion) {
          return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;
        }
        if (!(await isCompanyActive(trx, companyId))) return { ok: false, code: "FLEET_COMPANY_INACTIVE" } as const;

        const changeDate = today();
        await closeOpenRegistration(trx, { entityColumn: "vehicle_id", entityId: id, to: changeDate, actorUserId });
        await openRegistration(trx, {
          companyId,
          vehicleId: id,
          registrationNumber: regNumber,
          registrationCountry: input.registrationCountry,
          certificateNumber: input.certificateNumber,
          from: changeDate,
          actorUserId,
          source: "manual",
        });

        const sets = {
          registration_number: regNumber,
          registration_country: input.registrationCountry,
          registration_certificate_number: input.certificateNumber ?? current.registration_certificate_number,
          version: current.version + 1,
          updated_by: actorUserId,
        };
        const [updated] = await trx("vehicles").update(sets).where({ id }).returning("*");

        const changes =
          buildDiff(current, updated, ["registration_number", "registration_country", "registration_certificate_number"]) ?? {};
        await insertRevision(trx, {
          companyId,
          entityType: "vehicle",
          entityId: id,
          revision: updated.version,
          action: "update",
          changes,
          source: "manual",
          actorUserId,
        });

        return {
          ok: true,
          data: { ...updated, old_registration_number: current.registration_number, old_registration_country: current.registration_country },
        } as const;
      });
    } catch (error) {
      const mapped = mapUniqueViolation(error);
      if (mapped) return { ok: false, code: mapped };
      throw error;
    }

    if (!result.ok) return result;
    const { data } = result;
    await broker.send("fleet.registration.changed", {
      company_id: companyId,
      entity_type: "vehicle",
      entity_id: id,
      old_registration_number: data.old_registration_number,
      old_registration_country: data.old_registration_country,
      new_registration_number: data.registration_number,
      new_registration_country: data.registration_country,
      changed_at: new Date(),
    });
    await publishUpserted(data);
    await publishAudit(companyId, actorUserId, "fleet_vehicle.registration_changed", "vehicle", id);
    return { ok: true, data: { id: data.id, version: data.version }, warnings: [] };
  }
}

export default VehicleService;
