const tableName = "oauth_refresh_tokens";

exports.up = function (knex) {
  return knex.schema.createTable(tableName, (tbl) => {
    tbl.increments("_id").primary();
    tbl.string("id", 100).unique();
    tbl.string("access_token_id", 100).index();
    tbl.boolean("revoked");
    tbl.datetime("expires_at").nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
