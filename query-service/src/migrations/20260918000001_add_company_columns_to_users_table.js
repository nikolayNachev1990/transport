const tableName = "users";

// Mirrors the 3 new fields user.created can now carry (see
// auth-service's 20260918000004 migration + Events/user.created.mjs) —
// additive-only migration (not editing the original), since this table
// holds the real seeded admin/moderator/test accounts other tests
// depend on; no deleted_at here, this table never keeps a row past
// user.deleted (see the generic sync map's "delete" action for that
// topic).
exports.up = async function (knex) {
  return knex.schema.alterTable(tableName, (tbl) => {
    tbl.uuid("company_id");
    tbl.uuid("created_by");
    tbl.text("company_role");
  });
};

exports.down = async function (knex) {
  return knex.schema.alterTable(tableName, (tbl) => {
    tbl.dropColumn("company_id");
    tbl.dropColumn("created_by");
    tbl.dropColumn("company_role");
  });
};
