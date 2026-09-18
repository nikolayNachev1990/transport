// SPEC-fleet-service.md §3.8/§3.9/§6. The biggest validation surface in
// fleet-service: document_type-driven rules (subject match, applies_to_
// kinds, requires_number, has_country, multiple_active) plus the same
// encrypt-on-write/reveal-on-demand pattern driver profiles use for
// is_sensitive numbers.
import { v7 as uuidv7 } from "uuid";
import type { Knex } from "knex";
import { db, broker } from "../../resources.mjs";
import { encryptField } from "@transport/core/crypt";
import { encryptionKey } from "../../config/security.mjs";
import { validate } from "@transport/core/validator";
import { buildDiff, insertRevision } from "../lib/revisions.mjs";
import { publishAudit } from "../lib/audit.mjs";
import { DOCUMENT_EDITABLE_FIELDS } from "../lib/documentFields.mjs";

export type DocumentErrorCode =
  | "FLEET_COMPANY_INACTIVE"
  | "FLEET_NOT_FOUND"
  | "FLEET_UNIT_NOT_ACTIVE"
  | "FLEET_DOCUMENT_TYPE_SUBJECT_MISMATCH"
  | "FLEET_DOCUMENT_NUMBER_REQUIRED"
  | "FLEET_DOCUMENT_COUNTRY_REQUIRED"
  | "FLEET_DOCUMENT_ALREADY_CURRENT"
  | "FLEET_DOCUMENT_ATTRIBUTES_INVALID"
  | "FLEET_DOCUMENT_NOT_CURRENT"
  | "FLEET_INVALID_DATE_RANGE"
  | "FLEET_VERSION_CONFLICT"
  | "FLEET_FORBIDDEN";

// §9: "Документи — създаване/редакция/подновяване" — owner/transport_manager
// always; accountant only for insurance/contract/toll-category types.
const ACCOUNTANT_ALLOWED_CATEGORIES = new Set(["insurance", "contract", "toll"]);
function roleAllowsCategory(role: string, category: string): boolean {
  if (role === "owner" || role === "transport_manager") return true;
  if (role === "accountant") return ACCOUNTANT_ALLOWED_CATEGORIES.has(category);
  return false;
}

export type DocumentResult<T> =
  | { ok: true; data: T; warnings: { code: string }[] }
  | { ok: false; code: DocumentErrorCode; currentVersion?: number };

interface DocumentTypeRow extends Record<string, unknown> {
  code: string;
  subject_type: string;
  category: string;
  applies_to_kinds: string[] | null;
  requires_number: boolean;
  has_country: boolean;
  multiple_active: boolean;
  is_sensitive: boolean;
  attributes_schema: Record<string, unknown>;
}

interface DocumentRow extends Record<string, unknown> {
  id: string;
  company_id: string;
  document_type_code: string;
  vehicle_id: string | null;
  trailer_id: string | null;
  driver_user_id: string | null;
  version: number;
  is_current: boolean;
  country: string | null;
  document_number: string | null;
  document_number_last4: string | null;
}

function pickPresent(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in source) out[f] = source[f];
  return out;
}

function subjectOf(input: Record<string, unknown>): { column: "vehicle_id" | "trailer_id" | "driver_user_id" | null; value: string | null } {
  if (input.vehicle_id) return { column: "vehicle_id", value: input.vehicle_id as string };
  if (input.trailer_id) return { column: "trailer_id", value: input.trailer_id as string };
  if (input.driver_user_id) return { column: "driver_user_id", value: input.driver_user_id as string };
  return { column: null, value: null };
}

function checkDateRange(row: Record<string, unknown>): boolean {
  const issuedOn = row.issued_on as string | null;
  if (issuedOn && issuedOn > new Date().toISOString().slice(0, 10)) return false; // §5.3: future issued_on -> error
  return true;
}

async function validateAgainstType(
  trx: Knex.Transaction,
  companyId: string,
  typeCode: string,
  subject: { column: "vehicle_id" | "trailer_id" | "driver_user_id" | null; value: string | null },
  country: string | null,
  documentNumberProvided: boolean,
  attributes: Record<string, unknown> | null | undefined,
): Promise<{ ok: true; type: DocumentTypeRow } | { ok: false; code: DocumentErrorCode }> {
  const type = (await trx("document_types").where({ code: typeCode }).first()) as DocumentTypeRow | undefined;
  if (!type) return { ok: false, code: "FLEET_NOT_FOUND" };

  // subject_type -> column doesn't follow a uniform "<type>_id" pattern —
  // driver's own column is driver_user_id, not driver_id.
  const SUBJECT_COLUMNS: Record<string, "vehicle_id" | "trailer_id" | "driver_user_id" | null> = {
    vehicle: "vehicle_id",
    trailer: "trailer_id",
    driver: "driver_user_id",
    company: null,
  };
  const expectedColumn = SUBJECT_COLUMNS[type.subject_type];
  if (expectedColumn !== subject.column) return { ok: false, code: "FLEET_DOCUMENT_TYPE_SUBJECT_MISMATCH" };

  if (subject.column && subject.value && type.applies_to_kinds) {
    const table = subject.column === "vehicle_id" ? "vehicles" : "trailers";
    const row = await trx(table).where({ id: subject.value, company_id: companyId }).whereNull("deleted_at").first();
    if (!row) return { ok: false, code: "FLEET_UNIT_NOT_ACTIVE" };
    if (!type.applies_to_kinds.includes(row.kind as string)) return { ok: false, code: "FLEET_DOCUMENT_TYPE_SUBJECT_MISMATCH" };
  } else if (subject.column === "driver_user_id" && subject.value) {
    const driver = await trx("drivers").where({ company_id: companyId, user_id: subject.value }).whereNull("deleted_at").first();
    if (!driver) return { ok: false, code: "FLEET_UNIT_NOT_ACTIVE" };
  } else if (subject.column && subject.value) {
    const table = subject.column === "vehicle_id" ? "vehicles" : "trailers";
    const row = await trx(table).where({ id: subject.value, company_id: companyId }).whereNull("deleted_at").first();
    if (!row) return { ok: false, code: "FLEET_UNIT_NOT_ACTIVE" };
  }

  if (type.requires_number && !documentNumberProvided) return { ok: false, code: "FLEET_DOCUMENT_NUMBER_REQUIRED" };
  if (type.has_country && !country) return { ok: false, code: "FLEET_DOCUMENT_COUNTRY_REQUIRED" };

  if (attributes && Object.keys(attributes).length > 0) {
    const errors = validate(attributes, type.attributes_schema, null);
    if (errors) return { ok: false, code: "FLEET_DOCUMENT_ATTRIBUTES_INVALID" };
  }

  return { ok: true, type };
}

async function assertNoCurrentDuplicate(
  trx: Knex.Transaction,
  companyId: string,
  typeCode: string,
  type: DocumentTypeRow,
  subject: { column: "vehicle_id" | "trailer_id" | "driver_user_id" | null; value: string | null },
  country: string | null,
  excludeId?: string,
): Promise<boolean> {
  if (type.multiple_active) return true;

  let query = trx("documents").where({ company_id: companyId, document_type_code: typeCode, is_current: true }).whereNull("deleted_at");
  query = subject.column ? query.andWhere({ [subject.column]: subject.value }) : query.whereNull("vehicle_id").whereNull("trailer_id").whereNull("driver_user_id");
  if (type.has_country) query = query.andWhere({ country });
  if (excludeId) query = query.andWhereNot({ id: excludeId });

  const existing = await query.first();
  return !existing;
}

function encryptedNumberSets(type: DocumentTypeRow, documentNumber: string | undefined): Record<string, unknown> {
  if (documentNumber === undefined) return {};
  if (documentNumber === null || documentNumber === "") {
    return { document_number: null, document_number_enc: null, document_number_last4: null };
  }
  if (type.is_sensitive) {
    return { document_number: null, document_number_enc: encryptField(documentNumber, encryptionKey), document_number_last4: documentNumber.slice(-4) };
  }
  return { document_number: documentNumber, document_number_enc: null, document_number_last4: documentNumber.slice(-4) };
}

const EVENT_FIELDS = [
  "id",
  "company_id",
  "document_type_code",
  "vehicle_id",
  "trailer_id",
  "driver_user_id",
  "document_number_last4",
  "series",
  "issuer_name",
  "issuer_country",
  "country",
  "issued_on",
  "valid_from",
  "valid_to",
  "valid_to_km",
  "categories",
  "previous_document_id",
  "superseded_at",
  "is_current",
  "reminders_muted",
  "source",
  "version",
  "created_at",
  "updated_at",
] as const;

async function publishUpserted(row: DocumentRow): Promise<void> {
  const body: Record<string, unknown> = {};
  for (const f of EVENT_FIELDS) body[f] = (row as Record<string, unknown>)[f] ?? null;
  await broker.send("fleet.document.upserted", body);
}

class DocumentService {
  async create(
    companyId: string,
    actorUserId: string,
    role: string,
    input: Record<string, unknown>,
    source = "manual",
    aiMeta?: { extractionId: string; confirmedBy: string },
  ): Promise<DocumentResult<{ id: string; version: number }>> {
    const subject = subjectOf(input);
    const editable = pickPresent(input, DOCUMENT_EDITABLE_FIELDS);
    if (!checkDateRange(editable)) return { ok: false, code: "FLEET_INVALID_DATE_RANGE" };

    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const check = await validateAgainstType(
        trx,
        companyId,
        input.document_type_code as string,
        subject,
        (editable.country as string | null) ?? null,
        editable.document_number !== undefined && editable.document_number !== null,
        editable.attributes as Record<string, unknown> | null,
      );
      if (!check.ok) return { ok: false, code: check.code } as const;
      if (!roleAllowsCategory(role, check.type.category as string)) return { ok: false, code: "FLEET_FORBIDDEN" } as const;

      const noDuplicate = await assertNoCurrentDuplicate(trx, companyId, input.document_type_code as string, check.type, subject, (editable.country as string | null) ?? null);
      if (!noDuplicate) return { ok: false, code: "FLEET_DOCUMENT_ALREADY_CURRENT" } as const;

      const id = uuidv7();
      const documentNumber = editable.document_number as string | undefined;
      const sets = {
        id,
        company_id: companyId,
        document_type_code: input.document_type_code,
        vehicle_id: subject.column === "vehicle_id" ? subject.value : null,
        trailer_id: subject.column === "trailer_id" ? subject.value : null,
        driver_user_id: subject.column === "driver_user_id" ? subject.value : null,
        ...pickPresent(editable, DOCUMENT_EDITABLE_FIELDS.filter((f) => f !== "document_number")),
        ...encryptedNumberSets(check.type, documentNumber),
        version: 1,
        source,
        created_by: actorUserId,
        updated_by: actorUserId,
        ...(aiMeta ? { extraction_id: aiMeta.extractionId, confirmed_by: aiMeta.confirmedBy, confirmed_at: new Date() } : {}),
      };
      const [inserted] = await trx("documents").insert(sets).returning("*");

      const changes = buildDiff(null, inserted, [...DOCUMENT_EDITABLE_FIELDS, "document_type_code", "vehicle_id", "trailer_id", "driver_user_id"]) ?? {};
      await insertRevision(trx, {
        companyId,
        entityType: "document",
        entityId: id,
        revision: 1,
        action: aiMeta ? "confirm" : "create",
        changes,
        source,
        actorUserId,
        extractionId: aiMeta?.extractionId ?? null,
      });

      return { ok: true, data: inserted as DocumentRow } as const;
    });

    if (!result.ok) return result;
    await publishUpserted(result.data);
    await publishAudit(companyId, actorUserId, "fleet_document.created", "document", result.data.id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }

  async update(
    id: string,
    companyId: string,
    role: string,
    patch: Record<string, unknown>,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<DocumentResult<{ id: string; version: number }>> {
    const presentFields = DOCUMENT_EDITABLE_FIELDS.filter((f) => f in patch);
    const appliedPatch = pickPresent(patch, presentFields);

    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = (await trx("documents").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as DocumentRow | undefined;
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;

      const type = (await trx("document_types").where({ code: current.document_type_code }).first()) as DocumentTypeRow;
      if (!roleAllowsCategory(role, type.category)) return { ok: false, code: "FLEET_FORBIDDEN" } as const;
      const merged = { ...current, ...appliedPatch };
      if (!checkDateRange(merged)) return { ok: false, code: "FLEET_INVALID_DATE_RANGE" } as const;

      if ("attributes" in appliedPatch && appliedPatch.attributes) {
        const errors = validate(appliedPatch.attributes, type.attributes_schema, null);
        if (errors) return { ok: false, code: "FLEET_DOCUMENT_ATTRIBUTES_INVALID" } as const;
      }

      if ("country" in appliedPatch && type.has_country) {
        const subject: { column: "vehicle_id" | "trailer_id" | "driver_user_id" | null; value: string | null } = current.vehicle_id
          ? { column: "vehicle_id", value: current.vehicle_id }
          : current.trailer_id
            ? { column: "trailer_id", value: current.trailer_id }
            : current.driver_user_id
              ? { column: "driver_user_id", value: current.driver_user_id }
              : { column: null, value: null };
        const noDuplicate = await assertNoCurrentDuplicate(trx, companyId, current.document_type_code, type, subject, appliedPatch.country as string | null, id);
        if (!noDuplicate) return { ok: false, code: "FLEET_DOCUMENT_ALREADY_CURRENT" } as const;
      }

      const documentNumber = appliedPatch.document_number as string | undefined;
      const numberSets = encryptedNumberSets(type, documentNumber);
      const diffFields = presentFields.map((f) => (f === "document_number" ? "document_number" : f));
      const changes = buildDiff(current, { ...current, ...appliedPatch, ...numberSets }, diffFields);
      if (!changes) return { ok: true, data: current, noChange: true } as const;

      const sets = {
        ...pickPresent(appliedPatch, DOCUMENT_EDITABLE_FIELDS.filter((f) => f !== "document_number")),
        ...numberSets,
        version: current.version + 1,
        updated_by: actorUserId,
      };
      const [updated] = await trx("documents").update(sets).where({ id }).returning("*");

      await insertRevision(trx, { companyId, entityType: "document", entityId: id, revision: updated.version, action: "update", changes, source: "manual", actorUserId });

      return { ok: true, data: updated as DocumentRow, noChange: false } as const;
    });

    if (!result.ok) return result;
    if (!result.noChange) {
      await publishUpserted(result.data);
      await publishAudit(companyId, actorUserId, "fleet_document.updated", "document", id);
    }
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }

  async renew(
    previousDocumentId: string,
    companyId: string,
    role: string,
    input: Record<string, unknown>,
    actorUserId: string,
  ): Promise<DocumentResult<{ id: string; version: number }>> {
    const editable = pickPresent(input, DOCUMENT_EDITABLE_FIELDS);
    if (!checkDateRange(editable)) return { ok: false, code: "FLEET_INVALID_DATE_RANGE" };

    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const previous = (await trx("documents").where({ id: previousDocumentId, company_id: companyId }).whereNull("deleted_at").first()) as
        | DocumentRow
        | undefined;
      if (!previous) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (!previous.is_current) return { ok: false, code: "FLEET_DOCUMENT_NOT_CURRENT" } as const;

      const type = (await trx("document_types").where({ code: previous.document_type_code }).first()) as DocumentTypeRow;
      if (!roleAllowsCategory(role, type.category)) return { ok: false, code: "FLEET_FORBIDDEN" } as const;
      const documentNumber = editable.document_number as string | undefined;
      if (type.requires_number && (documentNumber === undefined || documentNumber === null || documentNumber === "")) {
        return { ok: false, code: "FLEET_DOCUMENT_NUMBER_REQUIRED" } as const;
      }

      const id = uuidv7();
      const sets = {
        id,
        company_id: companyId,
        document_type_code: previous.document_type_code,
        vehicle_id: previous.vehicle_id,
        trailer_id: previous.trailer_id,
        driver_user_id: previous.driver_user_id,
        ...pickPresent(editable, DOCUMENT_EDITABLE_FIELDS.filter((f) => f !== "document_number")),
        ...encryptedNumberSets(type, documentNumber),
        previous_document_id: previousDocumentId,
        is_current: true,
        version: 1,
        source: "manual",
        created_by: actorUserId,
        updated_by: actorUserId,
      };
      const [inserted] = await trx("documents").insert(sets).returning("*");

      const changes = buildDiff(null, inserted, [...DOCUMENT_EDITABLE_FIELDS]) ?? {};
      await insertRevision(trx, { companyId, entityType: "document", entityId: id, revision: 1, action: "renew", changes, source: "manual", actorUserId });

      const [supersededPrevious] = await trx("documents")
        .update({ is_current: false, superseded_at: new Date(), version: previous.version + 1, updated_by: actorUserId })
        .where({ id: previousDocumentId })
        .returning("*");
      await insertRevision(trx, {
        companyId,
        entityType: "document",
        entityId: previousDocumentId,
        revision: supersededPrevious.version,
        action: "update",
        changes: { is_current: { old: true, new: false } },
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: inserted as DocumentRow, supersededPrevious: supersededPrevious as DocumentRow } as const;
    });

    if (!result.ok) return result;
    await publishUpserted(result.data);
    await publishUpserted(result.supersededPrevious);
    await publishAudit(companyId, actorUserId, "fleet_document.renewed", "document", result.data.id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }

  async delete(id: string, companyId: string, expectedVersion: number, actorUserId: string): Promise<DocumentResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = (await trx("documents").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as DocumentRow | undefined;
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;

      const [updated] = await trx("documents")
        .update({ deleted_at: new Date(), deleted_by: actorUserId, version: current.version + 1, updated_by: actorUserId })
        .where({ id })
        .returning("*");

      await insertRevision(trx, {
        companyId,
        entityType: "document",
        entityId: id,
        revision: updated.version,
        action: "delete",
        changes: { deleted_at: { changed: true } },
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: updated as DocumentRow } as const;
    });

    if (!result.ok) return result;
    await broker.send("fleet.document.deleted", { id: result.data.id, company_id: companyId, deleted_at: new Date() });
    await publishAudit(companyId, actorUserId, "fleet_document.deleted", "document", id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }

  async restore(id: string, companyId: string, expectedVersion: number, actorUserId: string): Promise<DocumentResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = (await trx("documents").where({ id, company_id: companyId }).whereNotNull("deleted_at").first()) as DocumentRow | undefined;
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;

      const [updated] = await trx("documents")
        .update({ deleted_at: null, deleted_by: null, version: current.version + 1, updated_by: actorUserId })
        .where({ id })
        .returning("*");

      await insertRevision(trx, {
        companyId,
        entityType: "document",
        entityId: id,
        revision: updated.version,
        action: "restore",
        changes: { deleted_at: { changed: true } },
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: updated as DocumentRow } as const;
    });

    if (!result.ok) return result;
    await publishUpserted(result.data);
    await publishAudit(companyId, actorUserId, "fleet_document.restored", "document", id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }

  async muteReminders(
    id: string,
    companyId: string,
    muted: boolean,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<DocumentResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = (await trx("documents").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as DocumentRow | undefined;
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;
      if ((current as unknown as { reminders_muted: boolean }).reminders_muted === muted) return { ok: true, data: current, noChange: true } as const;

      const [updated] = await trx("documents")
        .update({ reminders_muted: muted, version: current.version + 1, updated_by: actorUserId })
        .where({ id })
        .returning("*");

      await insertRevision(trx, {
        companyId,
        entityType: "document",
        entityId: id,
        revision: updated.version,
        action: "update",
        changes: { reminders_muted: { old: !muted, new: muted } },
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: updated as DocumentRow, noChange: false } as const;
    });

    if (!result.ok) return result;
    if (!result.noChange) await publishUpserted(result.data);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }
}

export default DocumentService;
