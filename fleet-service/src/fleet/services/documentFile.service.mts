// SPEC-fleet-service.md §7/§3.10. Files never pass through fleet-service
// (rule 7) — this only links an already-uploaded `files` row (synced from
// upload-service's own events) to a document.
import { v7 as uuidv7 } from "uuid";
import { db, broker } from "../../resources.mjs";
import { insertRevision } from "../lib/revisions.mjs";
import { publishAudit } from "../lib/audit.mjs";

export type DocumentFileErrorCode = "FLEET_NOT_FOUND" | "FLEET_FILE_NOT_FOUND" | "FLEET_FILE_REJECTED" | "FLEET_VERSION_CONFLICT";

export type DocumentFileResult<T> = { ok: true; data: T } | { ok: false; code: DocumentFileErrorCode; currentVersion?: number };

interface DocumentFileRow extends Record<string, unknown> {
  id: string;
  document_id: string;
  company_id: string;
  file_id: string;
  side: string;
  version: number;
}

class DocumentFileService {
  async attach(
    documentId: string,
    fileId: string,
    side: string,
    companyId: string,
    actorUserId: string,
  ): Promise<DocumentFileResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const document = await trx("documents").where({ id: documentId, company_id: companyId }).whereNull("deleted_at").first();
      if (!document) return { ok: false, code: "FLEET_NOT_FOUND" } as const;

      const file = await trx("files").where({ id: fileId, company_id: companyId }).first();
      if (!file) return { ok: false, code: "FLEET_FILE_NOT_FOUND" } as const;
      if (file.status === "rejected") return { ok: false, code: "FLEET_FILE_REJECTED" } as const;

      const id = uuidv7();
      const [inserted] = await trx("document_files")
        .insert({ id, company_id: companyId, document_id: documentId, file_id: fileId, side, version: 1, source: "manual", created_by: actorUserId, updated_by: actorUserId })
        .returning("*");

      await insertRevision(trx, {
        companyId,
        entityType: "document_file",
        entityId: id,
        revision: 1,
        action: "attach",
        changes: { document_id: { new: documentId, old: null }, file_id: { new: fileId, old: null } },
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: inserted as DocumentFileRow } as const;
    });

    if (!result.ok) return result;
    await broker.send("fleet.document_file.changed", {
      document_id: result.data.document_id,
      company_id: companyId,
      file_id: result.data.file_id,
      side: result.data.side,
      action: "attached",
    });
    await publishAudit(companyId, actorUserId, "fleet_document_file.attached", "document_file", result.data.id);
    return { ok: true, data: { id: result.data.id, version: result.data.version } };
  }

  async detach(id: string, companyId: string, expectedVersion: number, actorUserId: string): Promise<DocumentFileResult<{ id: string; version: number }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const current = (await trx("document_files").where({ id, company_id: companyId }).whereNull("deleted_at").first()) as DocumentFileRow | undefined;
      if (!current) return { ok: false, code: "FLEET_NOT_FOUND" } as const;
      if (current.version !== expectedVersion) return { ok: false, code: "FLEET_VERSION_CONFLICT", currentVersion: current.version } as const;

      const [updated] = await trx("document_files")
        .update({ deleted_at: new Date(), deleted_by: actorUserId, version: current.version + 1, updated_by: actorUserId })
        .where({ id })
        .returning("*");

      await insertRevision(trx, {
        companyId,
        entityType: "document_file",
        entityId: id,
        revision: updated.version,
        action: "detach",
        changes: { deleted_at: { changed: true } },
        source: "manual",
        actorUserId,
      });

      return { ok: true, data: updated as DocumentFileRow } as const;
    });

    if (!result.ok) return result;
    await broker.send("fleet.document_file.changed", {
      document_id: result.data.document_id,
      company_id: companyId,
      file_id: result.data.file_id,
      side: result.data.side,
      action: "detached",
    });
    await publishAudit(companyId, actorUserId, "fleet_document_file.detached", "document_file", id);
    return { ok: true, data: { id: result.data.id, version: result.data.version } };
  }

  async reorder(documentId: string, companyId: string, orderedFileRowIds: string[], actorUserId: string): Promise<DocumentFileResult<{ document_id: string }>> {
    const knex = db.client();
    const result = await knex.transaction(async (trx) => {
      const document = await trx("documents").where({ id: documentId, company_id: companyId }).whereNull("deleted_at").first();
      if (!document) return { ok: false, code: "FLEET_NOT_FOUND" } as const;

      for (let i = 0; i < orderedFileRowIds.length; i++) {
        await trx("document_files")
          .update({ sort_order: i, updated_by: actorUserId, updated_at: new Date() })
          .where({ id: orderedFileRowIds[i], document_id: documentId, company_id: companyId });
      }

      return { ok: true, data: { document_id: documentId } } as const;
    });

    if (!result.ok) return result;
    await broker.send("fleet.document_file.changed", { document_id: documentId, company_id: companyId, file_id: null, side: null, action: "reordered" });
    return { ok: true, data: result.data };
  }
}

export default DocumentFileService;
