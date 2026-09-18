// SPEC-fleet-service.md §3.13.
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE tyres (
      id            uuid PRIMARY KEY,
      company_id    uuid NOT NULL,
      serial        text NULL,
      brand         text NOT NULL,
      model         text NULL,
      size          text NOT NULL,
      dot_code      text NULL,
      season        text NULL CHECK (season IN ('summer','winter','all_season')),
      axle_type     text NULL CHECK (axle_type IN ('steer','drive','trailer','all_position')),
      status        text NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock','mounted','retreading','scrapped')),

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

  await knex.raw(`
    CREATE TABLE tyre_mountings (
      id             uuid PRIMARY KEY,
      company_id     uuid NOT NULL,
      tyre_id        uuid NOT NULL REFERENCES tyres (id),
      vehicle_id     uuid NULL REFERENCES vehicles (id),
      trailer_id     uuid NULL REFERENCES trailers (id),
      position       text NOT NULL,
      period         tstzrange NOT NULL,
      mounted_km     int NULL,
      removed_km     int NULL,
      tread_mm_start numeric(4,1) NULL,
      tread_mm_end   numeric(4,1) NULL,
      removal_reason text NULL,

      version     int NOT NULL DEFAULT 1,
      source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  uuid NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  uuid NOT NULL,
      deleted_at  timestamptz NULL,
      deleted_by  uuid NULL,
      CHECK (num_nonnulls(vehicle_id, trailer_id) = 1),
      EXCLUDE USING gist (tyre_id WITH =, period WITH &&) WHERE (deleted_at IS NULL)
    )
  `);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("tyre_mountings");
  return knex.schema.dropTableIfExists("tyres");
};
