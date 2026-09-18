const tableName = "mobile_prefixes";

exports.up = function (knex) {
  return knex.schema
    .createTable(tableName, (tbl) => {
      tbl.increments("id").unique().primary();

      tbl.string("prefix").notNullable();
      tbl.string("country").notNullable();
      tbl.timestamps(true, true);
      tbl.unique(["prefix", "country"]);
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
