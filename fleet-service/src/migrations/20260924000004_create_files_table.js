// Local copy of upload-service's file metadata — schema only for now, no
// consumer wired yet. upload-service's real events today (upload.created/
// updated/completed/deleted) are user-scoped and don't carry sha256,
// preview/thumbnail derivatives, or PDF page splitting; the richer
// file.uploaded/converted/rejected contract this table's columns assume
// is expected to arrive once the planned Python-based recognition
// pipeline (doc-service) and its upload path exist. Kept here now so
// documents/attachments (a later stage) have something to FK against.
const tableName = "files";

exports.up = async function (knex) {
  await knex.schema.createTable(tableName, (tbl) => {
    tbl.uuid("id").notNullable().primary();
    tbl.uuid("company_id").notNullable();
    tbl.text("status").notNullable().checkIn(["pending", "ready", "rejected"]);
    tbl.text("mime_type");
    tbl.bigInteger("size_bytes");
    tbl.specificType("sha256", "char(64)");
    tbl.text("original_name");
    tbl.smallint("page_count");
    tbl.uuid("preview_file_id");
    tbl.uuid("thumbnail_file_id");
    tbl.specificType("page_file_ids", "uuid[]");
    tbl.text("rejected_reason");
    tbl.uuid("uploaded_by");
    tbl.uuid("source_event_id").notNullable();
    tbl.timestamp("synced_at", { useTz: true }).notNullable();
  });

  return knex.schema.alterTable(tableName, (tbl) => {
    tbl.index("company_id", "files_company_idx");
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
