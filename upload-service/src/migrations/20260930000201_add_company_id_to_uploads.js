// SPEC-doc-service.md §7 — fleet-service's own `files` mirror needs a
// company_id to scope by (X-Hasura-Company-Id), and upload-service is the
// only place that knows it at upload time (from the caller's session).
// Nullable: this service also backs uploads with no company context (e.g.
// a user's own avatar) — those simply never sync into any company-scoped
// consumer's mirror table.
const tableName = "uploads";

exports.up = async function (knex) {
  return knex.schema.alterTable(tableName, (table) => {
    table.uuid("company_id").nullable().index();
  });
};

exports.down = async function (knex) {
  return knex.schema.alterTable(tableName, (table) => {
    table.dropColumn("company_id");
  });
};
