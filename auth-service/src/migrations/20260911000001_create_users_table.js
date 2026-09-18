const ON_UPDATE_TIMESTAMP_FUNCTION = `
  CREATE OR REPLACE FUNCTION on_update_timestamp()
  RETURNS trigger AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
$$ language 'plpgsql';
`;

const tableName = "users";

exports.up = async function (knex) {
  await knex.raw(ON_UPDATE_TIMESTAMP_FUNCTION);
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  return knex.schema
    .createTable(tableName, (tbl) => {
      tbl.uuid("id").unique().notNullable().primary().defaultTo(knex.raw("uuid_generate_v4()"));

      tbl.string("name");

      tbl.string("email").unique().index().nullable();
      tbl.timestamp("email_verified_at");

      tbl.string("mobile_number").unique().index().nullable();
      tbl.boolean("mobile_number_verified").default(false);

      tbl.string("domain").nullable();

      tbl.string("role").default("user");

      // argon2's own hash string already embeds its salt — no separate
      // salt column needed (unlike the old bcrypt scheme).
      tbl.string("password");
      tbl.string("avatar").nullable();
      tbl.string("language").default("en");
      tbl.boolean("active").index().default(false);
      tbl.datetime("last_seen").nullable();
      tbl.datetime("notifications_last_seen").nullable();
      tbl.boolean("notifications_snooze").default(false);
      tbl.timestamp("notifications_snooze_expire").default(null);
      tbl.boolean("twofa").default(false);
      tbl.string("activation_token").index();
      tbl.string("country");
      tbl.string("google_id").unique().nullable().default(null);
      tbl.string("apple_id").unique().nullable().default(null);

      // Folded in from later "add column" migrations — see the
      // consolidation note in auth-service/src/migrations/README.md.
      // (public_key / public_key_updated_at dropped entirely — no more
      // field-level encryption or public-key device transfer.)
      // Was defaulted to a specific competing platform's domain
      // ("thisisdope.com") in the original migration — that default made no
      // sense for this project and has been dropped, not carried forward.
      tbl.string("platform").nullable();
      tbl.boolean("community_subscription").default(false).index();

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

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
