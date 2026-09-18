// SPEC-fleet-service.md §3.16.
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE tachograph_downloads (
      id              uuid PRIMARY KEY,
      company_id      uuid NOT NULL,
      vehicle_id      uuid NULL REFERENCES vehicles (id),
      driver_user_id  uuid NULL,
      downloaded_at   timestamptz NOT NULL,
      period_from     timestamptz NULL,
      period_to       timestamptz NULL,
      file_id         uuid NULL REFERENCES files (id),
      origin          text NOT NULL CHECK (origin IN ('manual','remote','office_reader')),

      version     int NOT NULL DEFAULT 1,
      source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  uuid NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  uuid NOT NULL,
      deleted_at  timestamptz NULL,
      deleted_by  uuid NULL,
      FOREIGN KEY (company_id, driver_user_id) REFERENCES drivers (company_id, user_id),
      CHECK (num_nonnulls(vehicle_id, driver_user_id) = 1)
    )
  `);
};

exports.down = async function (knex) {
  return knex.schema.dropTableIfExists("tachograph_downloads");
};
