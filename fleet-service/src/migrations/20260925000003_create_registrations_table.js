// SPEC-fleet-service.md §3.5. References vehicles/trailers created by the
// two previous migrations, so this one must run after both.
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE registrations (
      id                   uuid PRIMARY KEY,
      company_id           uuid NOT NULL,
      vehicle_id           uuid NULL REFERENCES vehicles (id),
      trailer_id           uuid NULL REFERENCES trailers (id),
      registration_number  text NOT NULL,
      registration_country char(2) NOT NULL,
      certificate_number   text NULL,
      period               daterange NOT NULL,

      version     int NOT NULL DEFAULT 1,
      source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  uuid NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  uuid NOT NULL,
      deleted_at  timestamptz NULL,
      deleted_by  uuid NULL,

      CHECK (num_nonnulls(vehicle_id, trailer_id) = 1),
      EXCLUDE USING gist (vehicle_id WITH =, period WITH &&) WHERE (vehicle_id IS NOT NULL AND deleted_at IS NULL),
      EXCLUDE USING gist (trailer_id WITH =, period WITH &&) WHERE (trailer_id IS NOT NULL AND deleted_at IS NULL)
    )
  `);

  await knex.raw(`CREATE INDEX registrations_number_idx ON registrations (company_id, registration_number)`);
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("registrations");
};
