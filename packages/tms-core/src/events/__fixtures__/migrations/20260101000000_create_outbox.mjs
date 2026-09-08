export async function up(knex) {
  await knex.schema.createTable("outbox", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("tenant_id").notNullable();
    table.string("aggregate_id").notNullable();
    table.string("event_type").notNullable();
    table.integer("version").notNullable();
    table.jsonb("payload").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("published_at", { useTz: true }).nullable();
  });
  await knex.schema.raw(
    "CREATE INDEX outbox_unpublished_idx ON outbox (created_at) WHERE published_at IS NULL",
  );
}

export async function down(knex) {
  await knex.schema.dropTable("outbox");
}
