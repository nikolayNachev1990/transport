exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE fleet_odometer_readings (
      id           uuid PRIMARY KEY,
      company_id    uuid NOT NULL,
      vehicle_id    uuid NOT NULL,
      value_km      int NOT NULL,
      read_at       timestamptz,
      origin        text NOT NULL,
      is_anomaly    boolean NOT NULL,
      file_id       uuid,
      source        text NOT NULL,
      version       int NOT NULL,
      synced_at     timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX fleet_odometer_readings_vehicle_idx ON fleet_odometer_readings (vehicle_id, read_at DESC)`);

  await knex.raw(`
    CREATE TABLE fleet_maintenance_plans (
      id                 uuid PRIMARY KEY,
      company_id          uuid NOT NULL,
      vehicle_id          uuid,
      trailer_id          uuid,
      task                text NOT NULL,
      custom_label        text,
      interval_km         int,
      interval_months     int,
      interval_hours      int,
      last_done_on        date,
      last_done_km        int,
      last_done_hours     int,
      next_due_on         date,
      next_due_km         int,
      remind_km_before    int NOT NULL,
      remind_days         int[],
      is_active           boolean NOT NULL,
      version             int NOT NULL,
      synced_at           timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX fleet_maintenance_plans_company_idx ON fleet_maintenance_plans (company_id) WHERE is_active`);

  await knex.raw(`
    CREATE TABLE fleet_maintenance_records (
      id                    uuid PRIMARY KEY,
      company_id             uuid NOT NULL,
      vehicle_id             uuid,
      trailer_id             uuid,
      plan_id                uuid,
      kind                   text NOT NULL,
      performed_on           date,
      odometer_km            int,
      engine_hours           int,
      workshop_name          text,
      workshop_company_id    uuid,
      description            text NOT NULL,
      work_order_number      text,
      billing_expense_id     uuid,
      downtime_from          timestamptz,
      downtime_to            timestamptz,
      version                int NOT NULL,
      synced_at              timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX fleet_maintenance_records_company_idx ON fleet_maintenance_records (company_id)`);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("fleet_maintenance_records");
  await knex.schema.dropTableIfExists("fleet_maintenance_plans");
  return knex.schema.dropTableIfExists("fleet_odometer_readings");
};
