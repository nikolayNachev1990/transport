// Local read copy of auth-service's users table — only the columns
// auth-service actually publishes on "user.created"/"user.updated"
// (see auth-service/src/auth/models/auth.model.mts's broker.send("user.created", ...)
// call), not auth-service's full column set (no password, no
// activation_token, etc. — nothing internal to auth ever crosses the
// event bus). Populated by the sync consumer once that's wired up; this
// migration only creates the table.
const tableName = "users";

exports.up = async function (knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  return knex.schema.createTable(tableName, (tbl) => {
    tbl.uuid("id").unique().notNullable().primary();
    tbl.string("name");
    tbl.string("email").unique().index().nullable();
    tbl.string("mobile_number").unique().index().nullable();
    tbl.boolean("mobile_number_verified").default(false);
    tbl.boolean("active").index().default(false);
    tbl.string("avatar").nullable();
    tbl.string("role").default("user");
    tbl.string("country").nullable();
    tbl.string("language").default("en");
    tbl.string("platform").nullable();
    tbl.boolean("community_subscription").default(false).index();
    tbl.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
