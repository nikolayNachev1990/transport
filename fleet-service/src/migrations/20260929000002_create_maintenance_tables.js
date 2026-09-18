// SPEC-fleet-service.md §3.12.
exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE maintenance_plans (
      id               uuid PRIMARY KEY,
      company_id       uuid NOT NULL,
      vehicle_id       uuid NULL REFERENCES vehicles (id),
      trailer_id       uuid NULL REFERENCES trailers (id),
      task             text NOT NULL CHECK (task IN (
                         'engine_oil','oil_filter','fuel_filter','air_filter','cabin_filter',
                         'gearbox_oil','axle_oil','brakes','brake_fluid','coolant','adblue_filter',
                         'timing','tyres_rotation','reefer_service','tail_lift_service',
                         'grease','general_service','other')),
      custom_label     text NULL,
      interval_km      int NULL,
      interval_months  int NULL,
      interval_hours   int NULL,
      last_done_on     date NULL,
      last_done_km     int NULL,
      last_done_hours  int NULL,
      next_due_on      date NULL,
      next_due_km      int NULL,
      remind_km_before int NOT NULL DEFAULT 2000,
      remind_days      int[] NULL,
      is_active        boolean NOT NULL DEFAULT true,

      version     int NOT NULL DEFAULT 1,
      source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  uuid NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  uuid NOT NULL,
      deleted_at  timestamptz NULL,
      deleted_by  uuid NULL,
      CHECK (num_nonnulls(vehicle_id, trailer_id) = 1),
      CHECK (num_nonnulls(interval_km, interval_months, interval_hours) >= 1)
    )
  `);

  await knex.raw(`
    CREATE TABLE maintenance_records (
      id                  uuid PRIMARY KEY,
      company_id          uuid NOT NULL,
      vehicle_id          uuid NULL REFERENCES vehicles (id),
      trailer_id          uuid NULL REFERENCES trailers (id),
      plan_id             uuid NULL REFERENCES maintenance_plans (id),
      kind                text NOT NULL CHECK (kind IN ('scheduled','repair','inspection_fix','warranty','accident_repair')),
      performed_on        date NOT NULL,
      odometer_km         int NULL,
      engine_hours        int NULL,
      workshop_name       text NULL,
      workshop_company_id uuid NULL,
      description         text NOT NULL,
      work_order_number   text NULL,
      billing_expense_id  uuid NULL,
      downtime_from       timestamptz NULL,
      downtime_to         timestamptz NULL,

      version     int NOT NULL DEFAULT 1,
      source      text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','system')),
      created_at  timestamptz NOT NULL DEFAULT now(),
      created_by  uuid NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      updated_by  uuid NOT NULL,
      deleted_at  timestamptz NULL,
      deleted_by  uuid NULL,
      CHECK (num_nonnulls(vehicle_id, trailer_id) = 1)
    )
  `);

  await knex.raw(`
    CREATE TABLE maintenance_record_files (
      record_id  uuid NOT NULL REFERENCES maintenance_records (id),
      file_id    uuid NOT NULL REFERENCES files (id),
      company_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid NOT NULL,
      deleted_at timestamptz NULL,
      deleted_by uuid NULL,
      PRIMARY KEY (record_id, file_id)
    )
  `);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("maintenance_record_files");
  await knex.schema.dropTableIfExists("maintenance_records");
  return knex.schema.dropTableIfExists("maintenance_plans");
};
