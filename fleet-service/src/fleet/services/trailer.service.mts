// Same shape as vehicle.service.mts, minus the units limit (§8: "Ремаркетата
// не влизат в този лимит").
import { v7 as uuidv7 } from "uuid";
import { db, broker } from "../../resources.mjs";
import { normalizeRegistrationNumber, normalizeVin } from "../lib/normalize.mjs";
import { isCompanyActive } from "../lib/limits.mjs";
import { buildDiff, insertRevision } from "../lib/revisions.mjs";
import { openRegistration, closeOpenRegistration, today } from "../lib/registrations.mjs";
import { publishAudit } from "../lib/audit.mjs";
import { TRAILER_ALL_FIELDS, TRAILER_UPDATE_FIELDS, TRAILER_STATUSES } from "../lib/trailerFields.mjs";

export type TrailerErrorCode =
  | "FLEET_COMPANY_INACTIVE"
  | "FLEET_DUPLICATE_VIN"
  | "FLEET_DUPLICATE_REGISTRATION"
  | "FLEET_DUPLICATE_INTERNAL_CODE"
  | "FLEET_INVALID_VIN"
  | "FLEET_INVALID_REGISTRATION_NUMBER"
  | "FLEET_INVALID_DATE_RANGE"
  | "FLEET_VERSION_CONFLICT"
  | "FLEET_NOT_FOUND";

export type TrailerResult<T> =
  | { ok: true; data: T; warnings: { code: string }[] }
  | { ok: false; code: TrailerErrorCode; currentVersion?: number };

interface TrailerRow extends Record<string, unknown> {
  id: string;
  company_id: string;
  version: number;
  status: string;
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

// "status" isn't in TRAILER_ALL_FIELDS (it's only settable via setStatus,
// not create/update) but the event snapshot still has to carry it.
const EVENT_FIELDS = [...TRAILER_ALL_FIELDS, "id", "company_id", "status", "source", "version", "created_at", "updated_at"] as const;

async function publishUpserted(row: TrailerRow): Promise<void> {
  await broker.send("fleet.trailer.upserted", pickFields(row, EVENT_FIELDS));
}

function checkDateRange(row: Record<string, unknown>): boolean {
  const first = row.first_registration_date;
  const current = row.current_registration_date;
  if (first && current) return String(first) <= String(current);
  return true;
}

const UNIQUE_VIOLATION = "23505";
function mapUniqueViolation(error: unknown): TrailerErrorCode | null {
  const err = error as { code?: string; constraint?: string };
  if (err?.code !== UNIQUE_VIOLATION) return null;
  if (err.constraint === "trailers_vin_uq") return "FLEET_DUPLICATE_VIN";
  if (err.constraint === "trailers_reg_uq") return "FLEET_DUPLICATE_REGISTRATION";
  if (err.constraint === "trailers_internal_code_uq") return "FLEET_DUPLICATE_INTERNAL_CODE";
  return null;
}

class TrailerService {
  async create(
    input: Record<string, unknown>,
    companyId: string,
    actorUserId: string,
    source = "manual",
  ): Promise<TrailerResult<{ id: string; version: number }>> {
    const regNumber = normalizeRegistrationNumber(input.registration_number as string);
    if (regNumber === null) return { ok: false, code: "FLEET_INVALID_REGISTRATION_NUMBER" };
    const vin = normalizeVin(input.vin as string);
    if (vin === null) return { ok: false, code: "FLEET_INVALID_VIN" };

    const candidate = { ...input, registration_number: regNumber, vin };
    if (!checkDateRange(candidate)) return { ok: false, code: "FLEET_INVALID_DATE_RANGE" };

    const knex = db.client();
    let result: { ok: true; data: TrailerRow } | { ok: false; code: TrailerErrorCode };
    try {
      result = await knex.transaction(async (trx) => {
        if (!(await isCompanyActive(trx, companyId))) return { ok: false, code: "FLEET_COMPANY_INACTIVE" } as const;

        const id = uuidv7();
        const sets = {
          id,
          company_id: companyId,
          // Only present keys — omitted ones (adr_equipped, ownership_type,
          // ...) must fall through to their column DEFAULT, not an
          // explicit NULL that would violate NOT NULL constraints.
          ...pickPresent(candidate, TRAILER_ALL_FIELDS),
          version: 1,
          source,
          created_by: actorUserId,
          updated_by: actorUserId,
        };
        const [inserted] = await trx("trailers").insert(sets).returning("*");

        await openRegistration(trx, {
          companyId,
          trailerId: id,
          registrationNumber: regNumber,
          registrationCountry: inserted.registration_country,
          certificateNumber: inserted.registration_certificate_number,
          from: (inserted.first_registration_date as string | null) ?? today(),
          actorUserId,
          source,
        });

        const changes = buildDiff(null, inserted, TRAILER_ALL_FIELDS) ?? {};
        await insertRevision(trx, {
          companyId,
          entityType: "trailer",
          entityId: id,
          revision: 1,
          action: "create",
          changes,
          source,
          actorUserId,
        });

        return { ok: true, data: inserted as TrailerRow } as const;
      });
    } catch (error) {
      const mapped = mapUniqueViolation(error);
      if (mapped) return { ok: false, code: mapped };
      throw error;
    }

    if (!result.ok) return result;

    await publishUpserted(result.data);
    await publishAudit(companyId, actorUserId, "fleet_trailer.created", "trailer", result.data.id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }

  async update(
    id: string,
    companyId: string,
    patch: Record<string, unknown>,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<TrailerResult<{ id: string; version: number }>> {
    const presentFields = TRAILER_UPDATE_FIELDS.filter((f) => f in patch);
    const appliedPatch = pickPresent(patch, presentFields);

    if (appliedPatch.vin !== undefined) {
      const vin = normalizeVin(appliedPatch.vin as string);
      if (vin === null) return { ok: false, code: "FLEET_INVALID_VIN" };
      appliedPatch.vin = vin;
    }

    const knex = db.client();
    let result:
      | { ok: true; data: TrailerRow; noChange: boolean }
      | { ok: false; code: TrailerErrorCode; currentVersion?: number };
    try {
      result = await knex.transaction(async (trx) => {
        const current = (await trx("trailers").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as
          | TrailerRow
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
        const [updated] = await trx("trailers").update(sets).where({ id }).returning("*");

        await insertRevision(trx, {
          companyId,
          entityType: "trailer",
          entityId: id,
          revision: updated.version,
          action: "update",
          changes,
          source: "manual",
          actorUserId,
        });

        return { ok: true, data: updated as TrailerRow, noChange: false } as const;
      });
    } catch (error) {
      const mapped = mapUniqueViolation(error);
      if (mapped) return { ok: false, code: mapped };
      throw error;
    }

    if (!result.ok) return result;
    if (!result.noChange) {
      await publishUpserted(result.data);
      await publishAudit(companyId, actorUserId, "fleet_trailer.updated", "trailer", id);
    }
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }

  async setStatus(
    id: string,
    companyId: string,
    newStatus: string,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<TrailerResult<{ id: string; version: number }>> {
    if (!(TRAILER_STATUSES as readonly string[]).includes(newStatus)) {
      return { ok: false, code: "FLEET_INVALID_DATE_RANGE" }; // unreachable: ajv enum already rejects this at REST layer
    }

    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = (await trx("trailers").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as
        | TrailerRow
        | undefined;
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) {
        return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;
      }
      if (!(await isCompanyActive(trx, companyId))) return { ok: false, code: "FLEET_COMPANY_INACTIVE" } as const;
      if (current.status === newStatus) return { ok: true, data: current, noChange: true } as const;

      const sets: Record<string, unknown> = { status: newStatus, version: current.version + 1, updated_by: actorUserId };
      if (newStatus === "sold") sets.sale_date = today();
      if (newStatus === "scrapped") sets.deregistration_date = today();

      const [updated] = await trx("trailers").update(sets).where({ id }).returning("*");

      const changes = buildDiff(current, updated, ["status", "sale_date", "deregistration_date"]) ?? {};
      await insertRevision(trx, {
        companyId,
        entityType: "trailer",
        entityId: id,
        revision: updated.version,
        action: "status_change",
        changes,
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: updated as TrailerRow, noChange: false } as const;
    });

    if (!result.ok) return result;
    if (!result.noChange) {
      await publishUpserted(result.data);
      await publishAudit(companyId, actorUserId, "fleet_trailer.status_changed", "trailer", id);
    }
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }

  async delete(
    id: string,
    companyId: string,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<TrailerResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = (await trx("trailers").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as
        | TrailerRow
        | undefined;
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) {
        return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;
      }
      if (!(await isCompanyActive(trx, companyId))) return { ok: false, code: "FLEET_COMPANY_INACTIVE" } as const;

      const sets = { deleted_at: new Date(), deleted_by: actorUserId, version: current.version + 1, updated_by: actorUserId };
      const [updated] = await trx("trailers").update(sets).where({ id }).returning("*");

      const changes = buildDiff(current, updated, ["deleted_at", "deleted_by"]) ?? {};
      await insertRevision(trx, {
        companyId,
        entityType: "trailer",
        entityId: id,
        revision: updated.version,
        action: "delete",
        changes,
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: updated as TrailerRow } as const;
    });

    if (!result.ok) return result;
    await broker.send("fleet.trailer.deleted", {
      id: result.data.id,
      company_id: companyId,
      deleted_at: result.data.deleted_at,
      deleted_by: result.data.deleted_by,
    });
    await publishAudit(companyId, actorUserId, "fleet_trailer.deleted", "trailer", id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }

  async restore(
    id: string,
    companyId: string,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<TrailerResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = (await trx("trailers").where({ id, company_id: companyId }).whereNotNull("deleted_at").first()) as
        | TrailerRow
        | undefined;
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) {
        return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;
      }
      if (!(await isCompanyActive(trx, companyId))) return { ok: false, code: "FLEET_COMPANY_INACTIVE" } as const;

      const sets = { deleted_at: null, deleted_by: null, version: current.version + 1, updated_by: actorUserId };
      const [updated] = await trx("trailers").update(sets).where({ id }).returning("*");

      const changes = buildDiff(current, updated, ["deleted_at", "deleted_by"]) ?? {};
      await insertRevision(trx, {
        companyId,
        entityType: "trailer",
        entityId: id,
        revision: updated.version,
        action: "restore",
        changes,
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: updated as TrailerRow } as const;
    });

    if (!result.ok) return result;
    await publishUpserted(result.data);
    await publishAudit(companyId, actorUserId, "fleet_trailer.restored", "trailer", id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }

  async changeRegistration(
    id: string,
    companyId: string,
    input: { registrationNumber: string; registrationCountry: string; certificateNumber?: string | null },
    expectedVersion: number,
    actorUserId: string,
  ): Promise<TrailerResult<{ id: string; version: number }>> {
    const regNumber = normalizeRegistrationNumber(input.registrationNumber);
    if (regNumber === null) return { ok: false, code: "FLEET_INVALID_REGISTRATION_NUMBER" };

    const knex = db.client();
    let result:
      | { ok: true; data: TrailerRow & { old_registration_number: string; old_registration_country: string } }
      | { ok: false; code: TrailerErrorCode; currentVersion?: number };
    try {
      result = await knex.transaction(async (trx) => {
        const current = (await trx("trailers").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as
          | TrailerRow
          | undefined;
        if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
        if (current.version !== expectedVersion) {
          return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;
        }
        if (!(await isCompanyActive(trx, companyId))) return { ok: false, code: "FLEET_COMPANY_INACTIVE" } as const;

        const changeDate = today();
        await closeOpenRegistration(trx, { entityColumn: "trailer_id", entityId: id, to: changeDate, actorUserId });
        await openRegistration(trx, {
          companyId,
          trailerId: id,
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
        const [updated] = await trx("trailers").update(sets).where({ id }).returning("*");

        const changes =
          buildDiff(current, updated, ["registration_number", "registration_country", "registration_certificate_number"]) ?? {};
        await insertRevision(trx, {
          companyId,
          entityType: "trailer",
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
      entity_type: "trailer",
      entity_id: id,
      old_registration_number: data.old_registration_number,
      old_registration_country: data.old_registration_country,
      new_registration_number: data.registration_number,
      new_registration_country: data.registration_country,
      changed_at: new Date(),
    });
    await publishUpserted(data);
    await publishAudit(companyId, actorUserId, "fleet_trailer.registration_changed", "trailer", id);
    return { ok: true, data: { id: data.id, version: data.version }, warnings: [] };
  }
}

export default TrailerService;
