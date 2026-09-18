// SPEC-fleet-service.md §3.17.
import { v7 as uuidv7 } from "uuid";
import { db, broker } from "../../resources.mjs";
import { buildDiff, insertRevision } from "../lib/revisions.mjs";
import { publishAudit } from "../lib/audit.mjs";

export type DamageReportErrorCode = "FLEET_NOT_FOUND" | "FLEET_VERSION_CONFLICT" | "FLEET_FILE_NOT_FOUND" | "FLEET_FILE_REJECTED";
export type DamageReportResult<T> = { ok: true; data: T; warnings: { code: string }[] } | { ok: false; code: DamageReportErrorCode; currentVersion?: number };

const REPORT_FIELDS = [
  "kind",
  "occurred_at",
  "location_text",
  "lat",
  "lng",
  "description",
  "third_party_involved",
  "police_report_number",
  "european_accident_statement",
  "insurance_document_id",
  "claim_number",
  "status",
  "order_id",
] as const;

function pickPresent(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in source) out[f] = source[f];
  return out;
}

async function publishUpserted(row: Record<string, unknown>): Promise<void> {
  await broker.send("fleet.damage_report.upserted", {
    id: row.id,
    company_id: row.company_id,
    vehicle_id: row.vehicle_id ?? null,
    trailer_id: row.trailer_id ?? null,
    driver_user_id: row.driver_user_id ?? null,
    kind: row.kind,
    status: row.status,
    occurred_at: row.occurred_at,
    version: row.version,
  });
}

class DamageReportService {
  async create(
    companyId: string,
    actorUserId: string,
    input: Record<string, unknown> & { vehicle_id?: string; trailer_id?: string; driver_user_id?: string },
  ): Promise<DamageReportResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const id = uuidv7();
      const sets = {
        id,
        company_id: companyId,
        vehicle_id: input.vehicle_id ?? null,
        trailer_id: input.trailer_id ?? null,
        driver_user_id: input.driver_user_id ?? null,
        ...pickPresent(input, REPORT_FIELDS),
        version: 1,
        source: "manual",
        created_by: actorUserId,
        updated_by: actorUserId,
      };
      const [inserted] = await trx("damage_reports").insert(sets).returning("*");
      const changes = buildDiff(null, inserted, [...REPORT_FIELDS, "vehicle_id", "trailer_id", "driver_user_id"]) ?? {};
      await insertRevision(trx, { companyId, entityType: "damage_report", entityId: id, revision: 1, action: "create", changes, source: "manual", actorUserId });
      return { ok: true, data: inserted } as const;
    });

    await publishUpserted(result.data);
    await publishAudit(companyId, actorUserId, "fleet_damage_report.created", "damage_report", result.data.id as string);
    return { ok: true, data: { id: result.data.id as string, version: result.data.version as number }, warnings: [] };
  }

  async update(
    id: string,
    companyId: string,
    patch: Record<string, unknown>,
    expectedVersion: number,
    actorUserId: string,
  ): Promise<DamageReportResult<{ id: string; version: number }>> {
    const presentFields = REPORT_FIELDS.filter((f) => f in patch);
    const appliedPatch = pickPresent(patch, presentFields);

    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = await trx("damage_reports").where({ id, company_id: companyId }).whereNull("deleted_at").first();
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;

      const changes = buildDiff(current, { ...current, ...appliedPatch }, presentFields);
      if (!changes) return { ok: true, data: current, noChange: true } as const;

      const [updated] = await trx("damage_reports").update({ ...appliedPatch, version: current.version + 1, updated_by: actorUserId }).where({ id }).returning("*");
      await insertRevision(trx, { companyId, entityType: "damage_report", entityId: id, revision: updated.version, action: "update", changes, source: "manual", actorUserId });
      return { ok: true, data: updated, noChange: false } as const;
    });

    if (!result.ok) return result;
    if (!result.noChange) {
      await publishUpserted(result.data);
      await publishAudit(companyId, actorUserId, "fleet_damage_report.updated", "damage_report", id);
    }
    return { ok: true, data: { id: result.data.id as string, version: result.data.version as number }, warnings: [] };
  }

  async attachFile(reportId: string, fileId: string, companyId: string, actorUserId: string): Promise<DamageReportResult<{ report_id: string; file_id: string }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const report = await trx("damage_reports").where({ id: reportId, company_id: companyId }).whereNull("deleted_at").first();
      if (!report) return { ok: false, code: "FLEET_NOT_FOUND" } as const;

      const file = await trx("files").where({ id: fileId, company_id: companyId }).first();
      if (!file) return { ok: false, code: "FLEET_FILE_NOT_FOUND" } as const;
      if (file.status === "rejected") return { ok: false, code: "FLEET_FILE_REJECTED" } as const;

      await trx("damage_report_files").insert({ report_id: reportId, file_id: fileId, company_id: companyId, created_by: actorUserId });
      return { ok: true, data: { report_id: reportId, file_id: fileId } } as const;
    });

    if (!result.ok) return result;
    await publishAudit(companyId, actorUserId, "fleet_damage_report.file_attached", "damage_report", reportId);
    return { ok: true, data: result.data, warnings: [] };
  }
}

export default DamageReportService;
