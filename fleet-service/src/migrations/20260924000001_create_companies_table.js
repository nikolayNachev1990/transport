// Local copy, written only by the company.created/company.updated
// consumers (see src/fleet/events/) — never mutated directly. Only the
// subset fleet actually needs: is_active (gate mutations), plan_code
// (the max_units limit check), country. Note: `country` is nullable
// here even though the spec's SQL draft showed it NOT NULL — the real
// source event (Events/company.created.mjs) allows a null country, and
// this table must be able to store whatever that event actually sends.
const tableName = "companies";

exports.up = async function (knex) {
  return knex.schema.createTable(tableName, (tbl) => {
    tbl.uuid("id").notNullable().primary();
    tbl.boolean("is_active").notNullable();
    tbl.text("plan_code").notNullable();
    tbl.text("country");
    tbl.timestamp("deleted_at", { useTz: true });
    tbl.uuid("source_event_id").notNullable();
    tbl.timestamp("synced_at", { useTz: true }).notNullable();
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
