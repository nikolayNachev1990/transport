const tableName = "sms_usage";

exports.up = function (knex) {
  return knex.schema
    .createTable(tableName, (tbl) => {
      tbl.bigIncrements("id").unique().notNullable().primary();
      // format: YYYYMMDD daily, YYYYWW weekly, YYYYMM monthly
      tbl.integer("date");
      tbl.integer("usage").default(0);
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
