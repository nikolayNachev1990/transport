import { v7 as uuidv7 } from "uuid";
import type { BrokerEvent } from "@transport/core/broker";

interface UploadCompleted extends BrokerEvent {
  body: {
    id: string;
    user_id: string;
    company_id: string | null;
    path: string;
    mime_type: string;
    size: string | number | null;
    updated_at: string;
  };
}

// SPEC-doc-service.md §7 — populates fleet_db.files (schema-only until
// now, see the migration that created it) so fleet_extraction_request's
// file lookup and the file_key embedded in fleet.extraction.requested
// have something real to read. company_id is null for uploads with no
// company context (e.g. a user's own avatar) — those aren't fleet's
// concern, skipped outright.
//
// Dynamic import, not top-level — see company.created.mts for why.
export default async (event: UploadCompleted) => {
  const { id, company_id, path, mime_type, size, user_id } = event.body;
  if (!company_id) return;

  const { db } = await import("../../resources.mjs");
  await db.raw(
    `INSERT INTO files (id, company_id, status, mime_type, size_bytes, storage_key, uploaded_by, source_event_id, synced_at)
     VALUES (:id, :companyId, 'ready', :mimeType, :sizeBytes, :storageKey, :uploadedBy, :sourceEventId, now())
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       mime_type = EXCLUDED.mime_type,
       size_bytes = EXCLUDED.size_bytes,
       storage_key = EXCLUDED.storage_key,
       source_event_id = EXCLUDED.source_event_id,
       synced_at = now()`,
    {
      id,
      companyId: company_id,
      mimeType: mime_type,
      sizeBytes: size === null ? null : Number(size),
      storageKey: path,
      uploadedBy: user_id,
      sourceEventId: uuidv7(),
    },
  );
};
