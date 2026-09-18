const tableName = "oauth_clients";

exports.up = function (knex) {
  return knex.schema
    .createTable(tableName, (tbl) => {
      tbl.bigInteger("id");
      tbl.uuid("user_id");
      tbl.string("provider").nullable();
      tbl.string("name");
      tbl.string("secret", 100).nullable();
      tbl.text("redirect");
      tbl.boolean("personal_access_client");
      tbl.boolean("password_client");
      tbl.boolean("revoked");
      tbl.timestamps(true, true);

      tbl.index(["user_id"], "oauth_clients_user_id");
      tbl.foreign("user_id").references("users.id").onDelete("CASCADE");
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
