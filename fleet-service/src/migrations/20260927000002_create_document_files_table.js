// SPEC-fleet-service.md §3.10.
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE document_files (
      id          uuid PRIMARY KEY,
      company_id  uuid NOT NULL,
      document_id uuid NOT NULL REFERENCES documents (id),
      file_id     uuid NOT NULL REFERENCES files (id),
      side        text NOT NULL DEFAULT 'full' CHECK (side IN ('full','front','back','page')),
      page_no     smallint NULL,
      sort_order  int NOT NULL DEFAULT 0,

      version     int NOT NULL DEFAULT 1,
      source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  uuid NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  uuid NOT NULL,
      deleted_at  timestamptz NULL,
      deleted_by  uuid NULL
    )
  `);

  await knex.raw(`CREATE UNIQUE INDEX document_files_uq ON document_files (document_id, file_id) WHERE deleted_at IS NULL`);
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("document_files");
};
