const ON_UPDATE_TIMESTAMP_FUNCTION = `
  CREATE OR REPLACE FUNCTION on_update_timestamp()
  RETURNS trigger AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
$$ language 'plpgsql';
`;

const tableName = "uploads";

exports.up = async function (knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw(ON_UPDATE_TIMESTAMP_FUNCTION);

  return knex.schema
    .createTable(tableName, (table) => {
      table.uuid("id").notNullable().primary().defaultTo(knex.raw("uuid_generate_v4()"));
      // waiting -> completed | error
      table.string("status", 15).notNullable().index();
      table.text("error").nullable();
      table.string("error_code").nullable();
      table.string("filename").notNullable();
      table.text("path").notNullable();
      table.uuid("user_id").notNullable().index();
      table.string("mime_type").notNullable();
      table.bigInteger("size").nullable();
      table.jsonb("meta").notNullable().defaultTo("{}");
      table.timestamps(true, true);
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

exports.down = async function (knex) {
  await knex.raw(`DROP TRIGGER IF EXISTS ${tableName}_updated_at ON ${tableName}`);
  return knex.schema.dropTableIfExists(tableName);
};
