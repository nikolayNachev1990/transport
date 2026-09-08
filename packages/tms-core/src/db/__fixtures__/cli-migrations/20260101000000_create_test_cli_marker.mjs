export async function up(knex) {
  await knex.schema.createTable("test_cli_marker", (table) => {
    table.increments("id").primary();
  });
}

export async function down(knex) {
  await knex.schema.dropTable("test_cli_marker");
}
