import path from "node:path";
import moment from "moment";
import { db, storage, broker } from "../../resources.mjs";
import s3Config, { bucket, presignedUrlExpireSeconds, uploadDir, mimeToExtension } from "../../config/s3.mjs";

export interface UploadRow {
  id: string;
  status: "waiting" | "completed" | "error";
  error: string | null;
  error_code: string | null;
  filename: string;
  path: string;
  user_id: string;
  company_id: string | null;
  mime_type: string;
  // pg returns bigint columns as strings (avoids precision loss above
  // Number.MAX_SAFE_INTEGER) — never coerced to number here, propagated
  // as-is through the API and the upload.updated/completed events too.
  size: string | null;
  meta: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

class UploadService {
  async emitUpdateEvent(row: UploadRow) {
    await broker.send("upload.updated", {
      id: row.id,
      status: row.status,
      user_id: row.user_id,
      mime_type: row.mime_type,
      size: row.size,
      updated_at: row.updated_at,
    });
  }

  async createUpload(userId: string, filename: string, mimeType: string, meta: Record<string, unknown> = {}, companyId: string | null = null) {
    if (!s3Config.allowedMimeTypes.includes(mimeType)) {
      return { success: false as const, message: `Not allowed MIME type: ${mimeType}`, code: "UNSUPPORTED_FILE_TYPE" };
    }

    const row = await db.insert<UploadRow>("uploads", {
      status: "waiting",
      filename,
      // Placeholder — replaced below once the row's own id is known, since
      // the S3 key is derived from it (uploads/<id><extension>).
      path: "",
      user_id: userId,
      company_id: companyId,
      mime_type: mimeType,
      meta,
    });
    if (!row) {
      return { success: false as const, message: "Error creating db record.", code: "SYSTEM_ERROR" };
    }

    const extension = mimeToExtension[mimeType] ?? path.extname(filename);
    const key = path.join(uploadDir, row.id + extension);
    const updated = await db.updateById<UploadRow>("uploads", row.id, { path: key });
    if (!updated) {
      return { success: false as const, message: "Error creating db record.", code: "SYSTEM_ERROR" };
    }

    const url = await storage.uploadUrl(bucket, key, presignedUrlExpireSeconds);
    if (!url) {
      return { success: false as const, message: "Error creating presigned url.", code: "SYSTEM_ERROR" };
    }

    await broker.send("upload.created", {
      id: updated.id,
      status: updated.status,
      filename: updated.filename,
      user_id: updated.user_id,
      mime_type: updated.mime_type,
      created_at: updated.created_at,
    });

    return { success: true as const, id: updated.id, path: key, url };
  }

  // Called after the client has PUT the file straight to storage using the
  // presigned URL from createUpload — verifies the object actually landed
  // (right MIME type, within the size limit) before marking it usable.
  async completeUpload(uploadId: string) {
    const upload = await db.findById<UploadRow>("uploads", uploadId);
    if (!upload) return { success: false as const, code: "NOT_FOUND" };

    const check = await storage.check(bucket, upload.path);
    if (!check.success) {
      const failed = await db.updateById<UploadRow>("uploads", uploadId, {
        status: "error",
        error: check.message ?? "Upload check failed",
        error_code: check.code ?? "SYSTEM_ERROR",
      });
      if (failed) await this.emitUpdateEvent(failed);
      return { success: false as const, code: check.code ?? "SYSTEM_ERROR", message: check.message };
    }

    const completed = await db.updateById<UploadRow>("uploads", uploadId, {
      status: "completed",
      size: check.size ?? null,
    });
    if (!completed) return { success: false as const, code: "SYSTEM_ERROR" };

    await this.emitUpdateEvent(completed);
    await broker.send("upload.completed", {
      id: completed.id,
      user_id: completed.user_id,
      company_id: completed.company_id,
      path: completed.path,
      mime_type: completed.mime_type,
      size: completed.size,
      updated_at: completed.updated_at,
    });

    return { success: true as const, id: completed.id, mimeType: completed.mime_type, size: completed.size };
  }

  async getDownloadUrl(uploadId: string) {
    const upload = await db.findById<UploadRow>("uploads", uploadId);
    if (!upload || upload.status !== "completed") return null;

    return storage.downloadUrl(bucket, upload.path, presignedUrlExpireSeconds);
  }

  // Cleans up abandoned presigned-URL sessions — uploads still "waiting"
  // long after createUpload issued their URL, because the client never
  // PUT the file and never called completeUpload. Deliberately does NOT
  // touch "completed" rows: those are permanent business documents (talon
  // scans, CMR photos, invoices), not ephemeral media with a fixed
  // retention window like the reference project's.
  async clearStaleQueue(staleAfterHours: number) {
    const cutoff = moment().utc().subtract(staleAfterHours, "hours").toDate();
    const stale = await db.raw<{ rows: UploadRow[] }>(
      `SELECT * FROM uploads WHERE status = 'waiting' AND created_at < :cutoff`,
      { cutoff },
    );

    for (const row of stale?.rows ?? []) {
      await storage.delete(bucket, row.path);
      await db.deleteById("uploads", row.id);
      await broker.send("upload.deleted", { id: row.id, user_id: row.user_id });
    }

    return stale?.rows.length ?? 0;
  }
}

export default UploadService;
