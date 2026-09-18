// SPEC-fleet-service.md §3.18/§13. Etap 8 — the recognition contract.
// No doc-service exists yet; this table + the fleet.extraction.requested/
// fleet.extraction.changed events it drives are the whole contract fleet-
// service commits to, verified against a test-only doc.extraction.*
// publisher in tester/ (never a real one in application code).
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE document_extractions (
      id                     uuid PRIMARY KEY,
      company_id             uuid NOT NULL,
      file_id                uuid NOT NULL REFERENCES files (id),
      requested_by           uuid NOT NULL,

      hint_vehicle_id        uuid NULL REFERENCES vehicles (id),
      hint_trailer_id        uuid NULL REFERENCES trailers (id),
      hint_driver_user_id    uuid NULL,
      hint_type_code         text NULL REFERENCES document_types (code),

      status                 text NOT NULL DEFAULT 'queued' CHECK (status IN
                              ('queued','processing','proposed','confirmed','rejected','failed','unreadable')),
      engine                 text NULL CHECK (engine IN ('local','ai')),
      detected_type_code     text NULL REFERENCES document_types (code),
      detected_subject       jsonb NULL,
      matched_vehicle_id     uuid NULL REFERENCES vehicles (id),
      matched_trailer_id     uuid NULL REFERENCES trailers (id),
      matched_driver_user_id uuid NULL,
      proposed_fields        jsonb NULL,
      confidence             jsonb NULL,
      readability_score      numeric(4,3) NULL,
      error_code             text NULL,

      result_document_id     uuid NULL REFERENCES documents (id),
      result_vehicle_id      uuid NULL REFERENCES vehicles (id),
      result_trailer_id      uuid NULL REFERENCES trailers (id),
      decided_by             uuid NULL,
      decided_at             timestamptz NULL,
      rejected_reason        text NULL,

      version     int NOT NULL DEFAULT 1,
      source      text NOT NULL DEFAULT 'system' CHECK (source IN ('manual','ai','import','system')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  uuid NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  uuid NOT NULL,
      deleted_at  timestamptz NULL,
      deleted_by  uuid NULL
    )
  `);
  await knex.raw(`CREATE UNIQUE INDEX extractions_file_uq ON document_extractions (company_id, file_id) WHERE deleted_at IS NULL`);
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("document_extractions");
};
