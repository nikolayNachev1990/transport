// SPEC-fleet-service.md §3.17.
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE damage_reports (
      id                     uuid PRIMARY KEY,
      company_id             uuid NOT NULL,
      vehicle_id             uuid NULL REFERENCES vehicles (id),
      trailer_id             uuid NULL REFERENCES trailers (id),
      driver_user_id         uuid NULL,
      kind                   text NOT NULL CHECK (kind IN ('accident','damage','theft','breakdown','cargo_damage','other')),
      occurred_at            timestamptz NOT NULL,
      location_text          text NULL,
      lat                    numeric(9,6) NULL,
      lng                    numeric(9,6) NULL,
      description            text NOT NULL,
      third_party_involved   boolean NULL,
      police_report_number   text NULL,
      european_accident_statement boolean NULL,
      insurance_document_id  uuid NULL REFERENCES documents (id),
      claim_number           text NULL,
      status                 text NOT NULL DEFAULT 'reported'
                             CHECK (status IN ('reported','under_review','claim_filed','repaired','closed','rejected')),
      order_id               uuid NULL,

      version     int NOT NULL DEFAULT 1,
      source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  uuid NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  uuid NOT NULL,
      deleted_at  timestamptz NULL,
      deleted_by  uuid NULL,
      FOREIGN KEY (company_id, driver_user_id) REFERENCES drivers (company_id, user_id),
      CHECK (num_nonnulls(vehicle_id, trailer_id) >= 1)
    )
  `);

  await knex.raw(`
    CREATE TABLE damage_report_files (
      report_id  uuid NOT NULL REFERENCES damage_reports (id),
      file_id    uuid NOT NULL REFERENCES files (id),
      company_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid NOT NULL,
      deleted_at timestamptz NULL,
      deleted_by uuid NULL,
      PRIMARY KEY (report_id, file_id)
    )
  `);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("damage_report_files");
  return knex.schema.dropTableIfExists("damage_reports");
};
