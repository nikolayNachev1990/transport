// SPEC-fleet-service.md §3.10. No dedicated broker event exists for
// attachments in §11's table — only audit.action, same as every other
// mutation, but no entity-snapshot event to publish here.
import { v7 as uuidv7 } from "uuid";
import { db } from "../../resources.mjs";
import { insertRevision } from "../lib/revisions.mjs";
import { publishAudit } from "../lib/audit.mjs";

export type AttachmentErrorCode = "FLEET_NOT_FOUND" | "FLEET_UNIT_NOT_ACTIVE" | "FLEET_FILE_NOT_FOUND" | "FLEET_FILE_REJECTED" | "FLEET_VERSION_CONFLICT";

export type AttachmentResult<T> = { ok: true; data: T } | { ok: false; code: AttachmentErrorCode; currentVersion?: number };

interface AttachmentRow extends Record<string, unknown> {
  id: string;
  version: number;
}

class AttachmentService {
  async add(
    companyId: string,
    subject: { vehicle_id?: string | null; trailer_id?: string | null; driver_user_id?: string | null },
    fileId: string,
    label: string | null,
    takenAt: string | null,
    actorUserId: string,
  ): Promise<AttachmentResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      if (subject.vehicle_id) {
        const row = await trx("vehicles").where({ id: subject.vehicle_id, company_id: companyId }).whereNull("deleted_at").first();
        if (!row) return { ok: false, code: "FLEET_UNIT_NOT_ACTIVE" } as const;
      } else if (subject.trailer_id) {
        const row = await trx("trailers").where({ id: subject.trailer_id, company_id: companyId }).whereNull("deleted_at").first();
        if (!row) return { ok: false, code: "FLEET_UNIT_NOT_ACTIVE" } as const;
      } else if (subject.driver_user_id) {
        const row = await trx("drivers").where({ company_id: companyId, user_id: subject.driver_user_id }).whereNull("deleted_at").first();
        if (!row) return { ok: false, code: "FLEET_UNIT_NOT_ACTIVE" } as const;
      }

      const file = await trx("files").where({ id: fileId, company_id: companyId }).first();
      if (!file) return { ok: false, code: "FLEET_FILE_NOT_FOUND" } as const;
      if (file.status === "rejected") return { ok: false, code: "FLEET_FILE_REJECTED" } as const;

      const id = uuidv7();
      const [inserted] = await trx("attachments")
        .insert({
          id,
          company_id: companyId,
          vehicle_id: subject.vehicle_id ?? null,
          trailer_id: subject.trailer_id ?? null,
          driver_user_id: subject.driver_user_id ?? null,
          file_id: fileId,
          label,
          taken_at: takenAt ? new Date(takenAt) : null,
          version: 1,
          source: "manual",
          created_by: actorUserId,
          updated_by: actorUserId,
        })
        .returning("*");

      await insertRevision(trx, {
        companyId,
        entityType: "attachment",
        entityId: id,
        revision: 1,
        action: "create",
        changes: { file_id: { new: fileId, old: null } },
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: inserted as AttachmentRow } as const;
    });

    if (!result.ok) return result;
    await publishAudit(companyId, actorUserId, "fleet_attachment.added", "attachment", result.data.id);
    return { ok: true, data: { id: result.data.id, version: result.data.version } };
  }

  async remove(id: string, companyId: string, expectedVersion: number, actorUserId: string): Promise<AttachmentResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = (await trx("attachments").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as AttachmentRow | undefined;
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;

      const [updated] = await trx("attachments")
        .update({ deleted_at: new Date(), deleted_by: actorUserId, version: current.version + 1, updated_by: actorUserId })
        .where({ id })
        .returning("*");

      await insertRevision(trx, {
        companyId,
        entityType: "attachment",
        entityId: id,
        revision: updated.version,
        action: "delete",
        changes: { deleted_at: { changed: true } },
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: updated as AttachmentRow } as const;
    });

    if (!result.ok) return result;
    await publishAudit(companyId, actorUserId, "fleet_attachment.removed", "attachment", id);
    return { ok: true, data: { id: result.data.id, version: result.data.version } };
  }
}

export default AttachmentService;
