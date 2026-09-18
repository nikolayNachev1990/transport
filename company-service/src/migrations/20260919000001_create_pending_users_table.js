const tableName = "pending_users";

// A staging queue: one row per identity mutation 1 (company_user_create,
// auth-service) created, populated here from that same user.created
// event — never written to directly. id is the auth identity's own id
// (an opaque foreign value, not minted here). Recovery lookup by email is
// always scoped to created_by = caller (see mutation 2's own checks) —
// an owner can only ever re-find people they themselves invited.
exports.up = async function (knex) {
  return knex.schema.createTable(tableName, (tbl) => {
    tbl.uuid("id").notNullable().primary();
    tbl.text("email").notNullable();
    tbl.text("name").notNullable();
    tbl.text("company_role").notNullable();
    tbl.uuid("company_id").notNullable().references("id").inTable("companies");
    tbl.uuid("created_by").notNullable();

    tbl.timestamps(true, true);

    tbl.index(["company_id", "created_by", "email"]);
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
