// SPEC-fleet-service.md §3.11.
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE odometer_readings (
      id          uuid PRIMARY KEY,
      company_id  uuid NOT NULL,
      vehicle_id  uuid NOT NULL REFERENCES vehicles (id),
      value_km    int  NOT NULL CHECK (value_km >= 0),
      read_at     timestamptz NOT NULL,
      origin      text NOT NULL CHECK (origin IN ('manual','driver_app','tachograph','telematics','document','fuel_invoice','service')),
      file_id     uuid NULL REFERENCES files (id),
      is_anomaly  boolean NOT NULL DEFAULT false,

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
  await knex.raw(`CREATE INDEX odometer_vehicle_time_idx ON odometer_readings (vehicle_id, read_at DESC)`);
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("odometer_readings");
};
