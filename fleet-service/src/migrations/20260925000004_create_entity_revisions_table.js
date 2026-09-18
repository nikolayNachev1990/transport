// SPEC-fleet-service.md §3.19 — one row per version bump of any tracked
// entity, written in the same transaction as the mutation itself (see
// fleet/lib/revisions.mts). "revision" always equals entity.version after
// the change, enforced by the UNIQUE constraint below rather than trusted
// blindly from caller-computed input.
const tableName = "entity_revisions";

exports.up = async function (knex) {
  await knex.schema.createTable(tableName, (tbl) => {
    tbl.uuid("id").notNullable().primary();
    tbl.uuid("company_id").notNullable();
    tbl.text("entity_type").notNullable();
    tbl.uuid("entity_id").notNullable();
    tbl.integer("revision").notNullable();
    tbl
      .text("action")
      .notNullable()
      .checkIn(["create", "update", "delete", "restore", "renew", "confirm", "status_change", "attach", "detach"]);
    tbl.jsonb("changes").notNullable();
    tbl.text("source").notNullable().checkIn(["manual", "ai", "import", "system"]);
    tbl.uuid("extraction_id");
    tbl.uuid("actor_user_id").notNullable();
    tbl.text("reason");
    tbl.timestamp("at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    tbl.unique(["entity_type", "entity_id", "revision"]);
  });

  await knex.raw(
    `CREATE INDEX entity_revisions_entity_idx ON ${tableName} (company_id, entity_type, entity_id, revision DESC)`,
  );
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists(tableName);
};
