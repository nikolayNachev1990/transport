const tableName = "plans";

// NULL in any limit column means unlimited — explicit numbers, never a
// formula computed at query time (the seed script does the arithmetic
// once, e.g. max_drivers = floor(max_trucks * 1.2), and writes the
// result here).
exports.up = async function (knex) {
  await knex.schema.createTable(tableName, (tbl) => {
    tbl.text("code").notNullable().primary();
    tbl.integer("max_owners");
    tbl.integer("max_staff");
    tbl.integer("max_trucks");
    tbl.integer("max_drivers");
    tbl.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // companies.subscription_plan already exists (nullable — a company
  // doesn't have to be on a plan) — this adds referential integrity on
  // top of it, plus a default: every new company starts on "free" so
  // mutation 1's (company_user_create) owner/staff-limit checks always
  // have a real plan row to look up, instead of treating "no plan yet"
  // as a separate no-limit case.
  await knex.schema.alterTable("companies", (tbl) => {
    tbl.foreign("subscription_plan").references("code").inTable(tableName);
  });
  await knex.schema.alterTable("companies", (tbl) => {
    tbl.text("subscription_plan").defaultTo("free").alter();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("companies", (tbl) => {
    tbl.text("subscription_plan").defaultTo(null).alter();
  });
  await knex.schema.alterTable("companies", (tbl) => {
    tbl.dropForeign("subscription_plan");
  });
  return knex.schema.dropTableIfExists(tableName);
};
