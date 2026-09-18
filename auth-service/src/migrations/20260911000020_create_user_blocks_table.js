const tableName = "user_blocks";

exports.up = function (knex) {
  return knex.schema
    .createTable(tableName, (tbl) => {
      tbl.bigIncrements("id").unique().notNullable().primary();
      tbl.uuid("user_id").index().nullable();
      tbl.uuid("block_user_id").index().nullable();
      tbl.timestamps(true, true);
      tbl.foreign("user_id").references("users.id").onDelete("CASCADE");
      tbl.foreign("block_user_id").references("users.id").onDelete("CASCADE");
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
