const tableName = "plans";

// Local mirror of company_db.plans, populated only from plan.upserted
// events (see auth-service/src/company/events/plan.upserted.mts) — never
// written to directly. NULL in any limit column means unlimited, same as
// the source table.
exports.up = async function (knex) {
  await knex.schema.createTable(tableName, (tbl) => {
    tbl.text("code").notNullable().primary();
    tbl.integer("max_owners");
    tbl.integer("max_staff");
    tbl.integer("max_trucks");
    tbl.integer("max_drivers");
    tbl.timestamp("updated_at", { useTz: true }).notNullable();
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
