// Local read copy of upload-service's uploads table — only the columns
// upload-service actually publishes on "upload.created"/"upload.updated"
// (see upload-service/src/upload/services/upload.service.mts's
// broker.send calls), not upload-service's full column set (no storage
// path, no error/error_code — internal to upload-service, never crosses
// the event bus). Populated by the sync consumer; this migration only
// creates the table.
const tableName = "uploads";

exports.up = async function (knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  return knex.schema.createTable(tableName, (tbl) => {
    tbl.uuid("id").unique().notNullable().primary();
    tbl.string("status", 15).index().notNullable();
    tbl.string("filename").notNullable();
    tbl.uuid("user_id").index().notNullable();
    tbl.string("mime_type").notNullable();
    tbl.bigInteger("size").nullable();
    tbl.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
