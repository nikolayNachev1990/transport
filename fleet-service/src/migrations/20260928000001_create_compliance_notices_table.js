// SPEC-fleet-service.md §3.20. `plan_id`/`equipment_id` reference tables
// that don't exist yet (maintenance_plans, equipment_items — Etap 6) —
// left as plain nullable uuid columns for now; add the REFERENCES
// constraints in an ALTER TABLE migration once those tables exist.
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE compliance_notices (
      id              uuid PRIMARY KEY,
      company_id      uuid NOT NULL,
      kind            text NOT NULL CHECK (kind IN ('expiring','expired','km_due','missing','download_due','maintenance_due')),
      document_id     uuid NULL REFERENCES documents (id),
      plan_id         uuid NULL,
      equipment_id    uuid NULL,
      subject_type    text NOT NULL,
      subject_id      uuid NOT NULL,
      type_code       text NULL,
      threshold       int  NOT NULL,
      due_key         text NOT NULL,
      emitted_at      timestamptz NOT NULL DEFAULT now(),
      UNIQUE (company_id, kind, subject_type, subject_id, type_code, threshold, due_key)
    )
  `);
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("compliance_notices");
};
