// SPEC-fleet-service.md §13/§3.18 — the recognition contract. No real
// doc-service exists yet; this is what fleet-service commits to on both
// sides (publishes fleet.extraction.requested, consumes doc.extraction.
// completed/failed) so doc-service can be built against a fixed contract
// later, verified today via a test-only publisher in tester/.
import { v7 as uuidv7 } from "uuid";
import type { Knex } from "knex";
import type { BrokerEvent } from "@transport/core/broker";
import { validate } from "@transport/core/validator";
import { db, broker } from "../../resources.mjs";
import { normalizeRegistrationNumber, normalizeVin } from "../lib/normalize.mjs";
import { insertRevision } from "../lib/revisions.mjs";
import { publishAudit } from "../lib/audit.mjs";
import VehicleService from "./vehicle.service.mjs";
import TrailerService from "./trailer.service.mjs";
import DocumentService from "./document.service.mjs";
import { DOCUMENT_EDITABLE_FIELDS } from "../lib/documentFields.mjs";

export type ExtractionErrorCode =
  | "FLEET_NOT_FOUND"
  | "FLEET_FILE_NOT_FOUND"
  | "FLEET_FILE_REJECTED"
  | "FLEET_FORBIDDEN"
  | "FLEET_EXTRACTION_NOT_PROPOSED"
  | "FLEET_EXTRACTION_ALREADY_REQUESTED"
  | "FLEET_DUPLICATE_VIN";

export type ExtractionResult<T> = { ok: true; data: T; warnings: { code: string }[] } | { ok: false; code: ExtractionErrorCode; existingVehicleId?: string };

interface ExtractionRow extends Record<string, unknown> {
  id: string;
  company_id: string;
  file_id: string;
  status: string;
  detected_type_code: string | null;
  hint_vehicle_id: string | null;
  hint_trailer_id: string | null;
  hint_driver_user_id: string | null;
  matched_vehicle_id: string | null;
  matched_trailer_id: string | null;
  matched_driver_user_id: string | null;
  requested_by: string;
  hint_type_code: string | null;
  version: number;
}

async function publishChanged(row: ExtractionRow): Promise<void> {
  await broker.send("fleet.extraction.changed", {
    id: row.id,
    company_id: row.company_id,
    file_id: row.file_id,
    status: row.status,
    detected_type_code: row.detected_type_code ?? null,
    matched_vehicle_id: row.matched_vehicle_id ?? null,
    matched_trailer_id: row.matched_trailer_id ?? null,
    matched_driver_user_id: row.matched_driver_user_id ?? null,
    // numeric(4,3) columns come back from pg as strings (its driver never
    // auto-parses NUMERIC to a JS number, to avoid float precision loss) —
    // same category of surprise as the Date-object issue elsewhere in this
    // service, just for numeric columns instead of date ones.
    readability_score: (() => {
      const raw = (row as unknown as { readability_score: string | number | null }).readability_score;
      return raw === null || raw === undefined ? null : Number(raw);
    })(),
    error_code: (row as unknown as { error_code: string | null }).error_code ?? null,
    result_document_id: (row as unknown as { result_document_id: string | null }).result_document_id ?? null,
    result_vehicle_id: (row as unknown as { result_vehicle_id: string | null }).result_vehicle_id ?? null,
    result_trailer_id: (row as unknown as { result_trailer_id: string | null }).result_trailer_id ?? null,
    version: row.version,
  });
}

class ExtractionService {
  // §13 step 1: a driver may only request for themselves or their own
  // current vehicle — the second half ("current vehicle") isn't checkable
  // yet without the same relationship-resolution gap noted for Hasura in
  // Etap 7, so only the self-hint case is enforced for a driver caller;
  // a driver-supplied vehicle hint is rejected outright rather than
  // trusted unchecked.
  async request(
    companyId: string,
    actorUserId: string,
    actorRole: string,
    fileId: string,
    hints: { vehicle_id?: string | null; trailer_id?: string | null; driver_user_id?: string | null; type_code?: string | null },
  ): Promise<ExtractionResult<{ id: string; version: number }>> {
    if (actorRole === "driver") {
      const isSelf = hints.driver_user_id === actorUserId;
      if (!isSelf) return { ok: false, code: "FLEET_FORBIDDEN" };
    }

    const knex = db.client();
    let result: { ok: true; data: ExtractionRow; allowedTypeCodes: string[]; mimeType: string | null } | { ok: false; code: ExtractionErrorCode };
    try {
      result = await knex.transaction(async (trx) => {
      const file = await trx("files").where({ id: fileId, company_id: companyId }).first();
      if (!file) return { ok: false, code: "FLEET_FILE_NOT_FOUND" } as const;
      if (file.status === "rejected") return { ok: false, code: "FLEET_FILE_REJECTED" } as const;

      const subjectType = hints.vehicle_id ? "vehicle" : hints.trailer_id ? "trailer" : hints.driver_user_id ? "driver" : null;
      const typesQuery = trx("document_types").where({ is_active: true });
      const types = subjectType ? await typesQuery.andWhere({ subject_type: subjectType }) : await typesQuery;
      const allowedTypeCodes = (types as { code: string }[]).map((t) => t.code);

      const id = uuidv7();
      const [inserted] = await trx("document_extractions")
        .insert({
          id,
          company_id: companyId,
          file_id: fileId,
          requested_by: actorUserId,
          hint_vehicle_id: hints.vehicle_id ?? null,
          hint_trailer_id: hints.trailer_id ?? null,
          hint_driver_user_id: hints.driver_user_id ?? null,
          hint_type_code: hints.type_code ?? null,
          status: "queued",
          version: 1,
          source: "system",
          created_by: actorUserId,
          updated_by: actorUserId,
        })
        .returning("*");

      await insertRevision(trx, {
        companyId,
        entityType: "document_extraction",
        entityId: id,
        revision: 1,
        action: "create",
        changes: { file_id: { new: fileId, old: null } },
        source: "system",
        actorUserId,
      });

      return { ok: true, data: inserted as ExtractionRow, allowedTypeCodes, mimeType: file.mime_type as string | null } as const;
      });
    } catch (error) {
      const err = error as { code?: string; constraint?: string };
      if (err?.code === "23505" && err.constraint === "extractions_file_uq") return { ok: false, code: "FLEET_EXTRACTION_ALREADY_REQUESTED" };
      throw error;
    }

    if (!result.ok) return result;
    await broker.send("fleet.extraction.requested", {
      extraction_id: result.data.id,
      company_id: companyId,
      file_id: fileId,
      mime_type: result.mimeType,
      hints,
      allowed_type_codes: result.allowedTypeCodes,
    });
    await publishAudit(companyId, actorUserId, "fleet_extraction.requested", "document_extraction", result.data.id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }

  // §13 step 2-3. Runs entirely from the Kafka consumer, no REST caller —
  // errors here are logged, not returned to anyone (there's no HTTP
  // request in flight by the time doc-service would reply).
  async handleCompleted(event: BrokerEvent): Promise<void> {
    const body = event.body as {
      extraction_id: string;
      engine: string;
      detected_type_code: string | null;
      detected_subject: Record<string, unknown> | null;
      fields: Record<string, unknown>;
      confidence: Record<string, unknown> | null;
      readability_score: number | null;
    };

    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const extraction = (await trx("document_extractions").where({ id: body.extraction_id }).whereNull("deleted_at").first()) as
        | ExtractionRow
        | undefined;
      if (!extraction || !["queued", "processing"].includes(extraction.status)) return null;

      // "fields" mixes core document columns (document_number, country,
      // valid_to, ...) with a type-specific "attributes" sub-object — only
      // the latter is checked against the type's own attributes_schema;
      // core columns are filtered against DOCUMENT_EDITABLE_FIELDS instead
      // (the same allowlist fleet_document_create/update validate against),
      // never against attributes_schema, which doesn't describe them at all.
      const dropped: string[] = [];
      const cleanedFields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body.fields ?? {})) {
        if ((DOCUMENT_EDITABLE_FIELDS as readonly string[]).includes(k) && k !== "attributes") cleanedFields[k] = v;
        else if (k !== "attributes") dropped.push(k);
      }
      if (body.detected_type_code && body.fields?.attributes && typeof body.fields.attributes === "object") {
        const type = await trx("document_types").where({ code: body.detected_type_code }).first();
        const schema = type?.attributes_schema as { properties?: Record<string, unknown> } | undefined;
        const known = new Set(Object.keys(schema?.properties ?? {}));
        const cleanedAttributes: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(body.fields.attributes as Record<string, unknown>)) {
          if (known.has(k)) cleanedAttributes[k] = v;
          else dropped.push(`attributes.${k}`);
        }
        cleanedFields.attributes = cleanedAttributes;
      }
      if (dropped.length > 0) console.log(`extraction ${body.extraction_id}: dropped unknown proposed fields`, dropped);

      const matched = await matchSubject(trx, extraction.company_id, body.detected_subject);

      const [updated] = await trx("document_extractions")
        .update({
          status: "proposed",
          engine: body.engine,
          detected_type_code: body.detected_type_code,
          detected_subject: body.detected_subject,
          matched_vehicle_id: matched.vehicleId,
          matched_trailer_id: matched.trailerId,
          matched_driver_user_id: matched.driverUserId,
          proposed_fields: cleanedFields,
          confidence: body.confidence,
          readability_score: body.readability_score,
          version: extraction.version + 1,
          updated_by: extraction.requested_by,
        })
        .where({ id: body.extraction_id })
        .returning("*");

      await insertRevision(trx, {
        companyId: extraction.company_id,
        entityType: "document_extraction",
        entityId: body.extraction_id,
        revision: updated.version,
        action: "update",
        changes: { status: { old: extraction.status, new: "proposed" } },
        source: "system",
        actorUserId: extraction.requested_by,
      });

      return updated as ExtractionRow;
    });

    if (result) await publishChanged(result);
  }

  async handleFailed(event: BrokerEvent): Promise<void> {
    const body = event.body as { extraction_id: string; error_code: string };

    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const extraction = (await trx("document_extractions").where({ id: body.extraction_id }).whereNull("deleted_at").first()) as
        | ExtractionRow
        | undefined;
      if (!extraction) return null;

      const [updated] = await trx("document_extractions")
        .update({ status: "failed", error_code: body.error_code, version: extraction.version + 1, updated_by: extraction.requested_by })
        .where({ id: body.extraction_id })
        .returning("*");

      await insertRevision(trx, {
        companyId: extraction.company_id,
        entityType: "document_extraction",
        entityId: body.extraction_id,
        revision: updated.version,
        action: "update",
        changes: { status: { old: extraction.status, new: "failed" } },
        source: "system",
        actorUserId: extraction.requested_by,
      });

      return updated as ExtractionRow;
    });

    if (result) await publishChanged(result);
  }

  // §13 step 4 — "не шофьорът" (never the driver); the REST layer already
  // screens driver out entirely, this is the service-side backstop.
  async confirm(
    id: string,
    companyId: string,
    actorUserId: string,
    actorRole: string,
    fields: Record<string, unknown>,
    target: "document" | "vehicle" | "trailer",
  ): Promise<ExtractionResult<{ id: string; target: string; resultId: string }>> {
    if (actorRole === "driver") return { ok: false, code: "FLEET_FORBIDDEN" };

    const extraction = await db.findById<ExtractionRow>("document_extractions", id);
    if (!extraction || extraction.company_id !== companyId) return { ok: false, code: "FLEET_NOT_FOUND" };
    if (!["proposed", "unreadable"].includes(extraction.status)) return { ok: false, code: "FLEET_EXTRACTION_NOT_PROPOSED" };

    const aiMeta = { extractionId: id, confirmedBy: actorUserId };
    let created: { ok: true; data: { id: string } } | { ok: false; code: string; existingVehicleId?: string };

    if (target === "vehicle") {
      const vin = normalizeVin(String(fields.vin ?? ""));
      if (vin) {
        const existing = await db.findByWhere("vehicles", { company_id: companyId, vin });
        if (existing && !Array.isArray(existing)) {
          return { ok: false, code: "FLEET_DUPLICATE_VIN", existingVehicleId: (existing as { id: string }).id };
        }
      }
      const service = new VehicleService();
      const res = await service.create(fields, companyId, actorUserId, "ai", aiMeta);
      created = res.ok ? { ok: true, data: { id: res.data.id } } : { ok: false, code: res.code };
    } else if (target === "trailer") {
      const vin = normalizeVin(String(fields.vin ?? ""));
      if (vin) {
        const existing = await db.findByWhere("trailers", { company_id: companyId, vin });
        if (existing && !Array.isArray(existing)) {
          return { ok: false, code: "FLEET_DUPLICATE_VIN", existingVehicleId: (existing as { id: string }).id };
        }
      }
      const service = new TrailerService();
      const res = await service.create(fields, companyId, actorUserId, "ai", aiMeta);
      created = res.ok ? { ok: true, data: { id: res.data.id } } : { ok: false, code: res.code };
    } else {
      const documentTypeCode = (fields.document_type_code as string | undefined) ?? extraction.detected_type_code ?? extraction.hint_type_code;
      const subjectInput: Record<string, unknown> = { ...fields, document_type_code: documentTypeCode };
      if (!subjectInput.vehicle_id && !subjectInput.trailer_id && !subjectInput.driver_user_id) {
        if (extraction.matched_vehicle_id ?? extraction.hint_vehicle_id) subjectInput.vehicle_id = extraction.matched_vehicle_id ?? extraction.hint_vehicle_id;
        else if (extraction.matched_trailer_id ?? extraction.hint_trailer_id) subjectInput.trailer_id = extraction.matched_trailer_id ?? extraction.hint_trailer_id;
        else if (extraction.matched_driver_user_id ?? extraction.hint_driver_user_id)
          subjectInput.driver_user_id = extraction.matched_driver_user_id ?? extraction.hint_driver_user_id;
      }
      const service = new DocumentService();
      const res = await service.create(companyId, actorUserId, actorRole, subjectInput, "ai", aiMeta);
      created = res.ok ? { ok: true, data: { id: res.data.id } } : { ok: false, code: res.code };
    }

    if (!created.ok) return { ok: false, code: created.code as ExtractionErrorCode, existingVehicleId: created.existingVehicleId };

    const knex = db.client();
    const updatedExtraction = await knex.transaction(async (trx) => {
      const current = (await trx("document_extractions").where({ id }).first()) as ExtractionRow;
      const resultCols: Record<string, unknown> = { decided_by: actorUserId, decided_at: new Date(), status: "confirmed", version: current.version + 1, updated_by: actorUserId };
      if (target === "document") resultCols.result_document_id = created!.data.id;
      if (target === "vehicle") resultCols.result_vehicle_id = created!.data.id;
      if (target === "trailer") resultCols.result_trailer_id = created!.data.id;

      const [updated] = await trx("document_extractions").update(resultCols).where({ id }).returning("*");
      await insertRevision(trx, {
        companyId,
        entityType: "document_extraction",
        entityId: id,
        revision: updated.version,
        action: "confirm",
        changes: { status: { old: current.status, new: "confirmed" } },
        source: "manual",
        actorUserId,
      });
      return updated as ExtractionRow;
    });

    await publishChanged(updatedExtraction);
    await publishAudit(companyId, actorUserId, "fleet_extraction.confirmed", "document_extraction", id);
    return { ok: true, data: { id, target, resultId: created.data.id }, warnings: [] };
  }

  async reject(id: string, companyId: string, actorUserId: string, reason: string): Promise<ExtractionResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = (await trx("document_extractions").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as
        | ExtractionRow
        | undefined;
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;

      const [updated] = await trx("document_extractions")
        .update({ status: "rejected", rejected_reason: reason, decided_by: actorUserId, decided_at: new Date(), version: current.version + 1, updated_by: actorUserId })
        .where({ id })
        .returning("*");

      await insertRevision(trx, {
        companyId,
        entityType: "document_extraction",
        entityId: id,
        revision: updated.version,
        action: "update",
        changes: { status: { old: current.status, new: "rejected" } },
        source: "manual",
        actorUserId,
        reason,
      });

      return { ok: true, data: updated as ExtractionRow } as const;
    });

    if (!result.ok) return result;
    await publishChanged(result.data);
    await publishAudit(companyId, actorUserId, "fleet_extraction.rejected", "document_extraction", id);
    return { ok: true, data: { id: result.data.id, version: result.data.version }, warnings: [] };
  }
}

// §13 step 3: "VIN → рег. номер (нормализиран) → име на шофьор" — a
// fallback chain, company-scoped, a suggestion only (never auto-applied).
async function matchSubject(
  trx: Knex.Transaction,
  companyId: string,
  detectedSubject: Record<string, unknown> | null,
): Promise<{ vehicleId: string | null; trailerId: string | null; driverUserId: string | null }> {
  const none = { vehicleId: null, trailerId: null, driverUserId: null };
  if (!detectedSubject) return none;

  const vin = typeof detectedSubject.vin === "string" ? normalizeVin(detectedSubject.vin) : null;
  if (vin) {
    const vehicle = await trx("vehicles").where({ company_id: companyId, vin }).whereNull("deleted_at").first();
    if (vehicle) return { vehicleId: vehicle.id, trailerId: null, driverUserId: null };
    const trailer = await trx("trailers").where({ company_id: companyId, vin }).whereNull("deleted_at").first();
    if (trailer) return { vehicleId: null, trailerId: trailer.id, driverUserId: null };
  }

  const regNumber = typeof detectedSubject.registration_number === "string" ? normalizeRegistrationNumber(detectedSubject.registration_number) : null;
  if (regNumber) {
    const vehicle = await trx("vehicles").where({ company_id: companyId, registration_number: regNumber }).whereNull("deleted_at").first();
    if (vehicle) return { vehicleId: vehicle.id, trailerId: null, driverUserId: null };
    const trailer = await trx("trailers").where({ company_id: companyId, registration_number: regNumber }).whereNull("deleted_at").first();
    if (trailer) return { vehicleId: null, trailerId: trailer.id, driverUserId: null };
  }

  const driverName = typeof detectedSubject.driver_name === "string" ? detectedSubject.driver_name.trim() : null;
  if (driverName) {
    const matches = await trx("drivers").where({ company_id: companyId }).whereNull("deleted_at").andWhereRaw("full_name ILIKE ?", [driverName]);
    if (matches.length === 1) return { vehicleId: null, trailerId: null, driverUserId: matches[0].user_id };
  }

  return none;
}

export default ExtractionService;
