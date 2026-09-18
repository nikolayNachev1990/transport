// Local read copy of company-service's pending_users table — populated
// from the same user.created event query-service already consumes for
// its own "users" mirror (see config/broker.mts), just conditionally,
// when the event carries a company_id. Never updated or deleted after
// insert — same as the source table (see company-service's own note).
const tableName = "pending_users";

exports.up = async function (knex) {
  return knex.schema.createTable(tableName, (tbl) => {
    tbl.uuid("id").notNullable().primary();
    tbl.text("email").notNullable();
    tbl.text("name").notNullable();
    tbl.text("company_role").notNullable();
    tbl.uuid("company_id").notNullable().index();
    tbl.uuid("created_by").notNullable().index();
    tbl.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
