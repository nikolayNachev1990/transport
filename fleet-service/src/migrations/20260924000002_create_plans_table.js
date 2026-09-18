// Local copy, written only by the plan.upserted consumer. max_units
// counts every vehicle kind fleet tracks (not just trucks) — see
// PROJECT-CONTEXT.md's note on the company-service/auth-service rename.
const tableName = "plans";

exports.up = async function (knex) {
  return knex.schema.createTable(tableName, (tbl) => {
    tbl.text("code").notNullable().primary();
    tbl.integer("max_units");
    tbl.uuid("source_event_id").notNullable();
    tbl.timestamp("synced_at", { useTz: true }).notNullable();
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
