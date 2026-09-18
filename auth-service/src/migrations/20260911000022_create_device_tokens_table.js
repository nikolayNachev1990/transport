const tableName = "device_tokens";

exports.up = function (knex) {
  return knex.schema
    .createTable(tableName, (tbl) => {
      tbl.bigIncrements("id").index().unsigned().primary();
      tbl.uuid("user_id").notNullable().index();
      tbl.string("platform", 50).notNullable().index();
      tbl.string("device_token", 255).index();
      tbl.boolean("active").default(true).index();
      // Folded in from the "add domain" migration — was defaulted to
      // "thisisdope.com" (a different platform's domain) originally;
      // dropped, no meaningful default for this project.
      tbl.string("domain").nullable();
      tbl.unique(["user_id", "platform", "device_token"]);
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
