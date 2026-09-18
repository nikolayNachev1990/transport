const tableName = "login_history";

exports.up = function (knex) {
  return knex.schema
    .createTable(tableName, (tbl) => {
      tbl.bigIncrements("id").unique().notNullable().primary();
      tbl.uuid("user_id").index().nullable();
      tbl.string("location").index().nullable();
      tbl.string("browser").index().nullable();
      tbl.string("platform").index().nullable();
      tbl.string("ip").index().nullable();
      // Folded in from the "add device signature" migration.
      tbl.uuid("device_signature").nullable();
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
