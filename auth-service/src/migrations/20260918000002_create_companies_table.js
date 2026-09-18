const tableName = "companies";

// Local mirror of company_db.companies, populated only from
// company.created/company.updated events (see
// auth-service/src/company/events/) — never written to directly, and only
// the subset of columns auth's own permission/limit checks actually need
// (not the full business/billing row company-service owns).
exports.up = async function (knex) {
  return knex.schema.createTable(tableName, (tbl) => {
    tbl.uuid("id").notNullable().primary();
    tbl.uuid("creator_user_id").references("id").inTable("users");
    tbl.text("subscription_plan").references("code").inTable("plans");
    tbl.timestamp("subscription_valid_until", { useTz: true });
    tbl.boolean("is_active").notNullable().default(true);

    tbl.index("creator_user_id");
    tbl.index("subscription_plan");
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
