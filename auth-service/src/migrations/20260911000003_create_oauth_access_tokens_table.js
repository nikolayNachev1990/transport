const tableName = "oauth_access_tokens";

exports.up = function (knex) {
  return knex.schema
    .createTable(tableName, (tbl) => {
      tbl.increments("_id").primary();
      tbl.string("id", 100).unique();
      tbl.uuid("user_id");
      tbl.bigInteger("client_id").unsigned();

      tbl.string("name").nullable();
      tbl.text("scopes").nullable();
      tbl.boolean("revoked");

      tbl.datetime("expires_at").nullable();

      tbl.index(["user_id"], "oauth_access_tokens_user_id");
      tbl.foreign("user_id").references("users.id").onDelete("CASCADE");

      tbl.timestamps(true, true);
    })
    .then(() =>
      knex.raw(`
        CREATE TRIGGER ${tableName}_updated_at
        BEFORE UPDATE ON ${tableName}
        FOR EACH ROW
        EXECUTE PROCEDURE on_update_timestamp();
      `),
    );
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
