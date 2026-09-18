exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE fleet_toll_devices (
      id                    uuid PRIMARY KEY,
      company_id             uuid NOT NULL,
      vehicle_id             uuid,
      provider               text NOT NULL,
      countries              text[] NOT NULL,
      device_serial          text NOT NULL,
      contract_number        text,
      axle_class             smallint,
      euro_class_declared    text,
      status                 text NOT NULL,
      valid_to               date,
      version                int NOT NULL,
      synced_at              timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX fleet_toll_devices_company_idx ON fleet_toll_devices (company_id)`);

  await knex.raw(`
    CREATE TABLE fleet_tacho_downloads (
      id                uuid PRIMARY KEY,
      company_id         uuid NOT NULL,
      vehicle_id         uuid,
      driver_user_id     uuid,
      downloaded_at      timestamptz,
      period_from        timestamptz,
      period_to          timestamptz,
      file_id            uuid,
      origin             text NOT NULL,
      version            int NOT NULL,
      synced_at          timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX fleet_tacho_downloads_vehicle_idx ON fleet_tacho_downloads (vehicle_id, downloaded_at DESC)`);
  await knex.raw(`CREATE INDEX fleet_tacho_downloads_driver_idx ON fleet_tacho_downloads (company_id, driver_user_id, downloaded_at DESC)`);

  await knex.raw(`
    CREATE TABLE fleet_damage_reports (
      id                            uuid PRIMARY KEY,
      company_id                     uuid NOT NULL,
      vehicle_id                     uuid,
      trailer_id                     uuid,
      driver_user_id                 uuid,
      kind                           text NOT NULL,
      occurred_at                    timestamptz,
      location_text                  text,
      lat                            numeric(9,6),
      lng                            numeric(9,6),
      description                    text NOT NULL,
      third_party_involved           boolean,
      police_report_number           text,
      european_accident_statement    boolean,
      insurance_document_id          uuid,
      claim_number                   text,
      status                         text NOT NULL,
      order_id                       uuid,
      version                        int NOT NULL,
      synced_at                      timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw(`CREATE INDEX fleet_damage_reports_company_idx ON fleet_damage_reports (company_id)`);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("fleet_damage_reports");
  await knex.schema.dropTableIfExists("fleet_tacho_downloads");
  return knex.schema.dropTableIfExists("fleet_toll_devices");
};
