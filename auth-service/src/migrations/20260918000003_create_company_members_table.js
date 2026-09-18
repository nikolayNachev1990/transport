const tableName = "company_members";

// Local mirror of company-side membership state, populated only from
// company events (see auth-service/src/company/events/) — with one
// deliberate exception: users_created_count/drivers_created_count are
// written ONLY by auth's own mutation logic (staff/owner-limit checks),
// never by an event consumer. A one-row-per-(user, company) membership —
// a person can belong to several companies.
exports.up = async function (knex) {
  return knex.schema.createTable(tableName, (tbl) => {
    tbl.uuid("user_id").notNullable().references("id").inTable("users");
    tbl.uuid("company_id").notNullable().references("id").inTable("companies");
    tbl.text("company_role").notNullable();
    tbl.boolean("is_active").notNullable().default(true);
    tbl.timestamp("deleted_at", { useTz: true });
    tbl.boolean("is_creator").notNullable().default(false);
    tbl.uuid("created_by").references("id").inTable("users");
    tbl.integer("users_created_count").notNullable().default(0);
    tbl.integer("drivers_created_count").notNullable().default(0);

    tbl.primary(["user_id", "company_id"]);
    tbl.index("company_id");
    tbl.index("is_active");
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
