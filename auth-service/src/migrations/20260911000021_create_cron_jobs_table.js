const ON_DELETE_OLD_CRON_JOBS_TRIGGER = `
  CREATE OR REPLACE FUNCTION delete_old_cron_jobs()
  RETURNS trigger AS $$
  BEGIN
    DELETE FROM cron_jobs
    WHERE created_at < NOW() - INTERVAL '5 days';
    RETURN NULL;
  END;
$$ language 'plpgsql';
`;

const tableName = "cron_jobs";

exports.up = async function (knex) {
  await knex.raw(ON_DELETE_OLD_CRON_JOBS_TRIGGER);
  return knex.schema
    .createTable(tableName, (tbl) => {
      tbl.bigIncrements("id").unique().notNullable().primary();
      tbl.boolean("active").default(false);
      tbl.string("event_name");
      tbl.string("timeout");
      tbl.timestamps(true, true);
    })
    .then(() =>
      knex.raw(`
        CREATE TRIGGER ${tableName}_updated_at
        BEFORE UPDATE ON ${tableName}
        FOR EACH ROW
        EXECUTE PROCEDURE on_update_timestamp();
      `),
    )
    .then(() =>
      knex.raw(`
        CREATE TRIGGER delete_old_cron_jobs_trigger
        AFTER INSERT ON cron_jobs
        FOR EACH ROW
        EXECUTE PROCEDURE delete_old_cron_jobs();
      `),
    );
};

exports.down = async function (knex) {
  await knex.raw(`DROP TRIGGER IF EXISTS delete_old_cron_jobs_trigger ON cron_jobs`);
  await knex.raw(`DROP TRIGGER IF EXISTS cron_jobs_updated_at ON cron_jobs`);
  await knex.raw(`DROP FUNCTION IF EXISTS delete_old_cron_jobs`);
  return knex.schema.dropTableIfExists(tableName);
};
