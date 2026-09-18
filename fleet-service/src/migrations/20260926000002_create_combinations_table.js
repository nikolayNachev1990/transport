// SPEC-fleet-service.md §3.6.
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE combinations (
      id          uuid PRIMARY KEY,
      company_id  uuid NOT NULL,
      vehicle_id  uuid NOT NULL REFERENCES vehicles (id),
      trailer_id  uuid NOT NULL REFERENCES trailers (id),
      period      tstzrange NOT NULL,
      note        text NULL,

      version     int NOT NULL DEFAULT 1,
      source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  uuid NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  uuid NOT NULL,
      deleted_at  timestamptz NULL,
      deleted_by  uuid NULL,
      EXCLUDE USING gist (vehicle_id WITH =, period WITH &&) WHERE (deleted_at IS NULL),
      EXCLUDE USING gist (trailer_id WITH =, period WITH &&) WHERE (deleted_at IS NULL)
    )
  `);
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("combinations");
};
