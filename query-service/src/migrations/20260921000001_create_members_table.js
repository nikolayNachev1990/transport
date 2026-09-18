// Local read copy of company-service's members table — the columns
// company-service actually publishes across companyMember.created/
// updated/activated/deleted (see company-service/src/company/services/
// member.service.mts), not its full column set. Populated by custom
// consumers, not the generic sync map — the composite (user_id,
// company_id) key isn't something db.updateById/deleteById (id-only)
// can address.
const tableName = "members";

exports.up = async function (knex) {
  return knex.schema.createTable(tableName, (tbl) => {
    tbl.uuid("user_id").notNullable();
    tbl.uuid("company_id").notNullable().index();
    tbl.text("company_role").notNullable();
    tbl.boolean("is_active").notNullable().default(true);
    tbl.boolean("is_creator").notNullable().default(false);
    tbl.uuid("created_by");
    tbl.timestamp("activated_at", { useTz: true });
    tbl.timestamp("deleted_at", { useTz: true });
    tbl.timestamps(true, true);

    tbl.primary(["user_id", "company_id"]);
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
