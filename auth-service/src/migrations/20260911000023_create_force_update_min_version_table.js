const tableName = "force_update_min_version";

exports.up = function (knex) {
  return knex.schema
    .createTable(tableName, (tbl) => {
      tbl.bigIncrements("id").index().unsigned().primary();
      tbl.integer("android").defaultTo(1);
      tbl.integer("ios").defaultTo(1);
      // Folded in from the "add platform" migration — was defaulted to
      // "thisisdope" (a different platform's name) originally; dropped.
      tbl.string("platform").nullable();
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
