const tableName = "user_mobile_numbers_changes";

exports.up = async function (knex) {
  return knex.schema
    .createTable(tableName, (tbl) => {
      tbl.increments("id").primary();
      tbl.uuid("user_id").index();
      tbl.string("new_mobile_number").unique().index();
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
