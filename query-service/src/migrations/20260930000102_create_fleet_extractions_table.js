// Etap 7's fleet_extractions was deferred (no source table existed in
// fleet_db yet — that only landed with Etap 8). Now fleet.extraction.
// changed exists to feed it.
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE fleet_extractions (
      id                      uuid PRIMARY KEY,
      company_id               uuid NOT NULL,
      file_id                  uuid NOT NULL,
      status                   text NOT NULL,
      detected_type_code       text,
      matched_vehicle_id       uuid,
      matched_trailer_id       uuid,
      matched_driver_user_id   uuid,
      readability_score        numeric(4,3),
      error_code               text,
      result_document_id       uuid,
      result_vehicle_id        uuid,
      result_trailer_id        uuid,
      version                  int NOT NULL,
      synced_at                timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX fleet_extractions_company_idx ON fleet_extractions (company_id)`);
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("fleet_extractions");
};
