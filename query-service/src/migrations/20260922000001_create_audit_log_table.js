// Insert-only (spec rule 12) — event_id as the primary key is what makes
// a redelivered audit.action a harmless no-op (Db.insert already
// swallows a duplicate-key error, same pattern as every other mirror
// table in this project).
const tableName = "audit_log";

exports.up = async function (knex) {
  return knex.schema.createTable(tableName, (tbl) => {
    tbl.uuid("event_id").notNullable().primary();
    tbl.uuid("actor_user_id").notNullable();
    tbl.uuid("company_id").notNullable().index();
    tbl.text("action").notNullable().index();
    tbl.text("target_type").notNullable();
    tbl.text("target_id").notNullable();
    tbl.timestamp("at", { useTz: true }).notNullable();
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
