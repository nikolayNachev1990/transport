const tableName = "auth_logs";

exports.up = function (knex) {
  return knex.schema
    .createTable(tableName, (tbl) => {
      tbl.bigIncrements("id").unique().notNullable().primary();
      tbl.uuid("user_id").index().nullable();
      tbl.string("access_token").index().nullable();
      tbl.string("refresh_token").index().nullable();
      tbl.text("log").index().nullable();
      tbl.string("ip").index().nullable();
      // Folded in from the "add request id" migration.
      tbl.uuid("request_uid").nullable();
      tbl.timestamps(true, true);
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
