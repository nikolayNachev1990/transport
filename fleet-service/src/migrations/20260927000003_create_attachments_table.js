// SPEC-fleet-service.md §3.10 — photos/files on a unit/driver without a
// document type (damage photos, cabin condition, etc.).
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE attachments (
      id             uuid PRIMARY KEY,
      company_id     uuid NOT NULL,
      vehicle_id     uuid NULL REFERENCES vehicles (id),
      trailer_id     uuid NULL REFERENCES trailers (id),
      driver_user_id uuid NULL,
      file_id        uuid NOT NULL REFERENCES files (id),
      label          text NULL,
      taken_at       timestamptz NULL,

      version     int NOT NULL DEFAULT 1,
      source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  uuid NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  uuid NOT NULL,
      deleted_at  timestamptz NULL,
      deleted_by  uuid NULL,
      FOREIGN KEY (company_id, driver_user_id) REFERENCES drivers (company_id, user_id),
      CHECK (num_nonnulls(vehicle_id, trailer_id, driver_user_id) = 1)
    )
  `);
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("attachments");
};
