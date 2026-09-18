const tableName = "oauth_auth_codes";

exports.up = function (knex) {
  return knex.schema.createTable(tableName, (tbl) => {
    tbl.increments("_id").primary();
    tbl.string("id", 100).unique();
    tbl.uuid("user_id");
    tbl.bigInteger("client_id").unsigned();
    tbl.text("scopes").nullable();
    tbl.boolean("revoked");
    tbl.datetime("expires_at").nullable();

    tbl.index(["user_id"], "index_user_id");
    tbl.foreign("user_id").references("users.id").onDelete("CASCADE");
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
