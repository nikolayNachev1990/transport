// SPEC-fleet-service.md §3.7 — two independent limits (per-vehicle max
// drivers, per-driver max vehicles + at-most-one-primary) enforced partly
// here (the two EXCLUDE constraints for "one primary" are a hard DB
// invariant) and partly in the service layer (the raw headcount limits,
// which need a COUNT, not something EXCLUDE can express).
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE vehicle_drivers (
      id              uuid PRIMARY KEY,
      company_id      uuid NOT NULL,
      vehicle_id      uuid NOT NULL REFERENCES vehicles (id),
      driver_user_id  uuid NOT NULL,
      role            text NOT NULL CHECK (role IN ('primary','secondary')),
      period          tstzrange NOT NULL,
      note            text NULL,

      version     int NOT NULL DEFAULT 1,
      source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  uuid NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  uuid NOT NULL,
      deleted_at  timestamptz NULL,
      deleted_by  uuid NULL,
      FOREIGN KEY (company_id, driver_user_id) REFERENCES drivers (company_id, user_id),
      EXCLUDE USING gist (vehicle_id WITH =, driver_user_id WITH =, period WITH &&) WHERE (deleted_at IS NULL),
      EXCLUDE USING gist (vehicle_id WITH =, period WITH &&) WHERE (role = 'primary' AND deleted_at IS NULL),
      EXCLUDE USING gist (driver_user_id WITH =, period WITH &&) WHERE (role = 'primary' AND deleted_at IS NULL)
    )
  `);

  await knex.raw(`CREATE INDEX vehicle_drivers_driver_idx ON vehicle_drivers (company_id, driver_user_id)`);
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("vehicle_drivers");
};
