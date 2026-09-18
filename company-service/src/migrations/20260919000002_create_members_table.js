const tableName = "members";

// company-service's own authoritative membership roster — auth_db.
// company_members (see auth-service's own migrations) is a downstream
// mirror of this, populated only from the events this table's writers
// publish (companyMember.created/activated), same "copies only from
// events" rule as every other cross-service mirror in this project.
// users_created_count/drivers_created_count live in auth_db only (per
// spec) — not duplicated here, this table has no equivalent columns.
exports.up = async function (knex) {
  return knex.schema.createTable(tableName, (tbl) => {
    tbl.uuid("user_id").notNullable();
    tbl.uuid("company_id").notNullable().references("id").inTable("companies").onDelete("CASCADE");
    tbl.text("company_role").notNullable();
    tbl.boolean("is_active").notNullable().default(true);
    tbl.boolean("is_creator").notNullable().default(false);
    tbl.uuid("created_by");
    // Guards rule 8's "never re-activate a deactivated member" — distinct
    // from is_active, which downgrade/deactivation also flips.
    tbl.timestamp("activated_at", { useTz: true });
    tbl.timestamp("deleted_at", { useTz: true });

    tbl.timestamps(true, true);

    tbl.primary(["user_id", "company_id"]);
    tbl.index("company_id");
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
