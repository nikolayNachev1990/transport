// document_number is never mirrored here — only document_number_last4,
// same "no sensitive numbers over the wire" rule as fleet_db's own events
// (SPEC-fleet-service.md §11). No premium/instalment fields either (§14:
// billing owns those, linked by fleet_document_id once billing exists).
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE fleet_documents (
      id                     uuid PRIMARY KEY,
      company_id             uuid NOT NULL,
      document_type_code     text NOT NULL,
      vehicle_id             uuid,
      trailer_id             uuid,
      driver_user_id         uuid,
      document_number_last4  text,
      series                 text,
      issuer_name            text,
      issuer_country         text,
      country                text,
      issued_on              date,
      valid_from             date,
      valid_to               date,
      valid_to_km            int,
      categories             text[],
      previous_document_id   uuid,
      superseded_at          timestamptz,
      is_current             boolean NOT NULL,
      reminders_muted        boolean NOT NULL,
      source                 text NOT NULL,
      version                int NOT NULL,
      created_at             timestamptz,
      updated_at             timestamptz,
      is_deleted              boolean NOT NULL DEFAULT false,
      synced_at              timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX fleet_documents_vehicle_idx ON fleet_documents (vehicle_id) WHERE NOT is_deleted`);
  await knex.raw(`CREATE INDEX fleet_documents_trailer_idx ON fleet_documents (trailer_id) WHERE NOT is_deleted`);
  await knex.raw(`CREATE INDEX fleet_documents_driver_idx ON fleet_documents (company_id, driver_user_id) WHERE NOT is_deleted`);
  await knex.raw(`CREATE INDEX fleet_documents_expiry_idx ON fleet_documents (valid_to) WHERE NOT is_deleted AND is_current`);

  await knex.raw(`
    CREATE TABLE fleet_document_files (
      id           uuid PRIMARY KEY,
      company_id    uuid NOT NULL,
      document_id   uuid NOT NULL,
      file_id       uuid,
      side          text,
      page_no       smallint,
      sort_order    int NOT NULL DEFAULT 0,
      is_deleted    boolean NOT NULL DEFAULT false,
      synced_at     timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX fleet_document_files_document_idx ON fleet_document_files (document_id) WHERE NOT is_deleted`);

  await knex.raw(`
    CREATE TABLE fleet_attachments (
      id              uuid PRIMARY KEY,
      company_id       uuid NOT NULL,
      vehicle_id       uuid,
      trailer_id       uuid,
      driver_user_id   uuid,
      file_id          uuid NOT NULL,
      label            text,
      taken_at         timestamptz,
      version          int NOT NULL,
      is_deleted       boolean NOT NULL DEFAULT false,
      synced_at        timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX fleet_attachments_company_idx ON fleet_attachments (company_id) WHERE NOT is_deleted`);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("fleet_attachments");
  await knex.schema.dropTableIfExists("fleet_document_files");
  return knex.schema.dropTableIfExists("fleet_documents");
};
