// SPEC-fleet-service.md §3.9.
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE documents (
      id                    uuid PRIMARY KEY,
      company_id            uuid NOT NULL,
      document_type_code    text NOT NULL REFERENCES document_types (code),

      vehicle_id            uuid NULL REFERENCES vehicles (id),
      trailer_id            uuid NULL REFERENCES trailers (id),
      driver_user_id        uuid NULL,

      document_number_enc   bytea NULL,
      document_number       text  NULL,
      document_number_last4 text  NULL,
      series                text  NULL,
      issuer_name           text  NULL,
      issuer_country        char(2) NULL,
      country               char(2) NULL,
      issued_on             date  NULL,
      valid_from            date  NULL,
      valid_to              date  NULL,
      valid_to_km           int   NULL,
      categories            text[] NULL,

      insured_sum           numeric(14,2) NULL,
      insured_sum_currency  char(3) NULL,
      deductible_amount     numeric(14,2) NULL,
      deductible_currency   char(3) NULL,
      broker_name           text NULL,

      attributes            jsonb NOT NULL DEFAULT '{}',

      previous_document_id  uuid NULL REFERENCES documents (id),
      superseded_at         timestamptz NULL,
      is_current            boolean NOT NULL DEFAULT true,

      remind_days           int[] NULL,
      reminders_muted       boolean NOT NULL DEFAULT false,
      notes                 text NULL,

      extraction_id         uuid NULL,
      confirmed_by          uuid NULL,
      confirmed_at          timestamptz NULL,

      version     int NOT NULL DEFAULT 1,
      source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  uuid NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  uuid NOT NULL,
      deleted_at  timestamptz NULL,
      deleted_by  uuid NULL,

      FOREIGN KEY (company_id, driver_user_id) REFERENCES drivers (company_id, user_id),
      CHECK (num_nonnulls(vehicle_id, trailer_id, driver_user_id) <= 1),
      CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to),
      CHECK (num_nonnulls(document_number, document_number_enc) <= 1),
      CHECK (source <> 'ai' OR confirmed_by IS NOT NULL)
    )
  `);

  await knex.raw(`CREATE INDEX documents_vehicle_idx ON documents (vehicle_id) WHERE deleted_at IS NULL`);
  await knex.raw(`CREATE INDEX documents_trailer_idx ON documents (trailer_id) WHERE deleted_at IS NULL`);
  await knex.raw(`CREATE INDEX documents_driver_idx ON documents (company_id, driver_user_id) WHERE deleted_at IS NULL`);
  await knex.raw(`CREATE INDEX documents_expiry_idx ON documents (valid_to) WHERE deleted_at IS NULL AND is_current`);
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("documents");
};
