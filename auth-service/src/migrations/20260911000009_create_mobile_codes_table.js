const tableName = "mobile_codes";

exports.up = function (knex) {
  return knex.schema
    .createTable(tableName, (tbl) => {
      tbl.uuid("id").unique().notNullable().primary().defaultTo(knex.raw("uuid_generate_v4()"));

      tbl.uuid("user_id").nullable();
      tbl.string("mobile_number").nullable();
      tbl.string("code").index().notNullable();
      tbl.string("type").notNullable();
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
