// SPEC-doc-service.md §7 — the exact S3 object key, copied from
// upload-service's upload.completed event (its own `path` column) so
// doc-service never has to know upload-service's key-naming convention.
// NOT NULL is safe here: this table has had no consumer wired until now
// (see the migration that created it), so it's guaranteed empty.
const tableName = "files";

exports.up = async function (knex) {
  return knex.schema.alterTable(tableName, (table) => {
    table.text("storage_key").notNullable();
  });
};

exports.down = async function (knex) {
  return knex.schema.alterTable(tableName, (table) => {
    table.dropColumn("storage_key");
  });
};
